"""Authentication endpoints"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from schemas import (
    UserRegister, UserLogin, UserSchema, TokenResponse, APIKeyCreate, APIKeyResponse,
    PasswordResetRequest, PasswordResetConfirm, PasswordResetResponse,
    EmailVerification, EmailVerificationResponse
)
from database import SessionLocal
from crud.user import (
    create_user, get_user_by_email, get_user_by_id, get_user_by_github_id, 
    get_user_by_google_id, update_last_login, add_api_key, revoke_api_key, list_users
)
from services.auth import (
    hash_password, verify_password, create_access_token, decode_access_token
)
from services.oauth import OAuth2Service
from services.email_service import EmailService, generate_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

# OAuth2 service instance
oauth2_service = OAuth2Service()

# Email service instance
email_service = EmailService()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(token: str = None, db: Session = Depends(get_db)):
    """Get current authenticated user from token"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token"
        )
    
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user = get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    return user


@router.post("/register", response_model=TokenResponse)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""
    existing_user = get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user = create_user(
        db,
        email=user_data.email,
        password=user_data.password,
        name=user_data.name,
        auth_provider="local"
    )
    
    # Generate email verification token
    verification_token = generate_token()
    verification_expires = datetime.utcnow() + timedelta(hours=48)
    user.email_verification_token = verification_token
    user.email_verification_expires_at = verification_expires
    db.commit()
    
    # Send verification email
    email_service.send_email_verification(
        to_email=user.email,
        user_name=user.name or user.email,
        verification_token=verification_token
    )
    
    # Send welcome email
    email_service.send_welcome_email(
        to_email=user.email,
        user_name=user.name or user.email,
        auth_provider="local"
    )
    
    access_token = create_access_token(user.id)
    user_schema = UserSchema.from_orm(user)
    
    return TokenResponse(access_token=access_token, user=user_schema)


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = get_user_by_email(db, credentials.email)
    
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    update_last_login(db, user.id)
    access_token = create_access_token(user.id)
    user_schema = UserSchema.from_orm(user)
    
    return TokenResponse(access_token=access_token, user=user_schema)


@router.get("/oauth/github/authorize")
def github_authorize():
    """Redirect to GitHub OAuth2 authorization"""
    return {"authorization_url": oauth2_service.get_github_auth_url()}


@router.post("/oauth/github/callback", response_model=TokenResponse)
async def github_callback(code: str, db: Session = Depends(get_db)):
    """GitHub OAuth2 callback handler"""
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization code is required"
        )
    
    # Exchange code for access token
    access_token = await oauth2_service.exchange_github_code(code)
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange authorization code"
        )
    
    # Get GitHub user data
    github_user = await oauth2_service.get_github_user(access_token)
    if not github_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to retrieve GitHub user data"
        )
    
    # Check if user already exists
    existing_user = get_user_by_github_id(db, github_user.id)
    if existing_user:
        update_last_login(db, existing_user.id)
        jwt_token = create_access_token(existing_user.id)
        return TokenResponse(
            access_token=jwt_token,
            user=UserSchema.from_orm(existing_user)
        )
    
    # Create new user
    new_user = create_user(
        db,
        email=github_user.email or f"github_{github_user.id}@github.local",
        password=None,
        name=github_user.name or github_user.login,
        auth_provider="github",
        github_id=github_user.id,
        avatar_url=github_user.avatar_url
    )
    
    update_last_login(db, new_user.id)
    jwt_token = create_access_token(new_user.id)
    return TokenResponse(
        access_token=jwt_token,
        user=UserSchema.from_orm(new_user)
    )


@router.get("/oauth/google/authorize")
def google_authorize():
    """Redirect to Google OAuth2 authorization"""
    return {"authorization_url": oauth2_service.get_google_auth_url()}


@router.post("/oauth/google/callback", response_model=TokenResponse)
async def google_callback(code: str, db: Session = Depends(get_db)):
    """Google OAuth2 callback handler"""
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization code is required"
        )
    
    # Exchange code for access token
    access_token = await oauth2_service.exchange_google_code(code)
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange authorization code"
        )
    
    # Get Google user data
    google_user = await oauth2_service.get_google_user(access_token)
    if not google_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to retrieve Google user data"
        )
    
    # Check if user already exists
    existing_user = get_user_by_google_id(db, google_user.id)
    if existing_user:
        update_last_login(db, existing_user.id)
        jwt_token = create_access_token(existing_user.id)
        return TokenResponse(
            access_token=jwt_token,
            user=UserSchema.from_orm(existing_user)
        )
    
    # Create new user
    new_user = create_user(
        db,
        email=google_user.email,
        password=None,
        name=google_user.name,
        auth_provider="google",
        google_id=google_user.id,
        avatar_url=google_user.picture
    )
    
    update_last_login(db, new_user.id)
    jwt_token = create_access_token(new_user.id)
    return TokenResponse(
        access_token=jwt_token,
        user=UserSchema.from_orm(new_user)
    )


# ============ PASSWORD RESET & EMAIL VERIFICATION ============

@router.post("/password-reset-request", response_model=PasswordResetResponse)
def request_password_reset(
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Request a password reset email"""
    user = get_user_by_email(db, request.email)
    
    if not user:
        # Don't reveal if email exists for security
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Generate reset token
    reset_token = generate_token()
    reset_expires = datetime.utcnow() + timedelta(hours=24)
    
    # Save token to database
    user.password_reset_token = reset_token
    user.password_reset_expires_at = reset_expires
    db.commit()
    
    # Send reset email
    email_service.send_password_reset_email(
        to_email=user.email,
        user_name=user.name or user.email,
        reset_token=reset_token
    )
    
    return {"message": "Password reset email sent. Please check your inbox."}


@router.post("/password-reset-confirm", response_model=TokenResponse)
def confirm_password_reset(
    request: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """Confirm password reset with token"""
    from models import User
    user = db.query(User).filter(User.password_reset_token == request.token).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Check if token has expired
    if user.password_reset_expires_at and user.password_reset_expires_at < datetime.utcnow():
        user.password_reset_token = None
        user.password_reset_expires_at = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token has expired"
        )
    
    # Update password
    user.password_hash = hash_password(request.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()
    
    # Create new access token
    access_token = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        user=UserSchema.from_orm(user)
    )


@router.post("/email-verify", response_model=EmailVerificationResponse)
def verify_email(
    request: EmailVerification,
    db: Session = Depends(get_db)
):
    """Verify email address with token"""
    from models import User
    user = db.query(User).filter(User.email_verification_token == request.token).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    # Check if token has expired
    if user.email_verification_expires_at and user.email_verification_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email verification token has expired"
        )
    
    # Mark email as verified
    user.is_verified = True
    user.email_verified_at = datetime.utcnow()
    user.email_verification_token = None
    user.email_verification_expires_at = None
    db.commit()
    
    return EmailVerificationResponse(
        message="Email verified successfully!",
        user=UserSchema.from_orm(user)
    )


@router.post("/resend-verification", response_model=PasswordResetResponse)
def resend_verification_email(
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Resend email verification"""
    user = get_user_by_email(db, request.email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified"
        )
    
    # Generate new verification token
    verification_token = generate_token()
    verification_expires = datetime.utcnow() + timedelta(hours=48)
    
    user.email_verification_token = verification_token
    user.email_verification_expires_at = verification_expires
    db.commit()
    
    # Send verification email
    email_service.send_email_verification(
        to_email=user.email,
        user_name=user.name or user.email,
        verification_token=verification_token
    )
    
    return {"message": "Verification email sent. Please check your inbox."}


@router.get("/me", response_model=UserSchema)
def get_current_user_profile(
    token: str = None,
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    user = get_current_user(token, db)
    return UserSchema.from_orm(user)


@router.post("/api-keys", response_model=APIKeyResponse)
def create_api_key(
    request: APIKeyCreate,
    token: str = None,
    db: Session = Depends(get_db)
):
    """Create a new API key for current user"""
    user = get_current_user(token, db)
    
    api_key = add_api_key(db, user.id, request.name)
    
    return APIKeyResponse(
        key=api_key,
        created_at=db.query(type(user)).filter(type(user).id == user.id).first().updated_at
    )


@router.delete("/api-keys/{key}")
def delete_api_key(
    key: str,
    token: str = None,
    db: Session = Depends(get_db)
):
    """Revoke an API key"""
    user = get_current_user(token, db)
    
    success = revoke_api_key(db, user.id, key)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    return {"message": "API key revoked"}


@router.get("/users", response_model=list[UserSchema])
def list_all_users(
    skip: int = 0,
    limit: int = 100,
    token: str = None,
    db: Session = Depends(get_db)
):
    """List all users (admin only)"""
    user = get_current_user(token, db)
    # TODO: Add admin check here
    
    users = list_users(db, skip=skip, limit=limit)
    return [UserSchema.from_orm(u) for u in users]
