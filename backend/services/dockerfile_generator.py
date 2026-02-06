"""Dockerfile generator for detected stacks"""

from typing import Optional
import logging

from services.stack_detection import StackDetectionResult
from services.stack_templates import StackTemplates

logger = logging.getLogger(__name__)


class DockerfileGenerator:
    """Generates Dockerfiles for various technology stacks"""
    
    @staticmethod
    def generate(detection_result: StackDetectionResult) -> str:
        """Generate Dockerfile content for detected stack"""
        
        stack = detection_result.stack
        
        if stack == "node":
            return DockerfileGenerator._generate_node(detection_result)
        elif stack == "python":
            return DockerfileGenerator._generate_python(detection_result)
        elif stack == "php":
            return DockerfileGenerator._generate_php(detection_result)
        elif stack == "go":
            return DockerfileGenerator._generate_go(detection_result)
        elif stack == "ruby":
            return DockerfileGenerator._generate_ruby(detection_result)
        elif stack == "java":
            return DockerfileGenerator._generate_java(detection_result)
        elif stack == "csharp":
            return DockerfileGenerator._generate_csharp(detection_result)
        elif stack == "rust":
            return DockerfileGenerator._generate_rust(detection_result)
        elif stack == "static":
            return DockerfileGenerator._generate_static(detection_result)
        else:
            return DockerfileGenerator._generate_fallback(detection_result)
    
    @staticmethod
    def _generate_node(result: StackDetectionResult) -> str:
        """Generate Node.js Dockerfile"""
        template = StackTemplates.get("node")
        port = template.default_port
        workdir = template.working_directory
        
        healthcheck = 'HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\\n'
        healthcheck += f'  CMD node -e "require(\'http\').get(\'http://localhost:{port}\', (r) => ' + '{ if (r.statusCode !== 200) throw new Error(r.statusCode) })"'
        
        return f"""# Generated Dockerfile for {result.framework or 'Node.js'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM node:18-alpine

WORKDIR {workdir}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Build if needed (for Next.js, TypeScript, etc.)
RUN npm run build --if-present || true

# Expose port
EXPOSE {port}

# Health check
{healthcheck}

# Start application
CMD npm start
"""
    
    @staticmethod
    def _generate_python(result: StackDetectionResult) -> str:
        """Generate Python Dockerfile"""
        template = StackTemplates.get("python")
        
        framework = result.framework or "Python"
        if framework == "Django":
            run_cmd = "python manage.py runserver 0.0.0.0:8000"
        elif framework == "Flask":
            run_cmd = "flask run --host=0.0.0.0"
        elif framework == "FastAPI":
            run_cmd = "uvicorn main:app --host 0.0.0.0 --port 8000"
        else:
            run_cmd = template.run_command
        
        return f"""# Generated Dockerfile for {framework} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM python:3.11-slim

WORKDIR {template.working_directory}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{template.default_port}/health')" || exit 1

# Set environment
ENV PYTHONUNBUFFERED=1

# Start application
CMD {run_cmd}
"""
    
    @staticmethod
    def _generate_php(result: StackDetectionResult) -> str:
        """Generate PHP Dockerfile"""
        template = StackTemplates.get("php")
        
        return f"""# Generated Dockerfile for {result.framework or 'PHP'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM php:8.2-apache

WORKDIR {template.working_directory}

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Copy composer files
COPY composer.json composer.lock* ./

# Install dependencies
RUN composer install --no-dev --optimize-autoloader

# Copy application code
COPY . .

# Enable Apache modules
RUN a2enmod rewrite

# Configure Apache
RUN echo '<Directory /app>' > /etc/apache2/sites-enabled/000-default.conf && \\
    echo '    AllowOverride All' >> /etc/apache2/sites-enabled/000-default.conf && \\
    echo '    Require all granted' >> /etc/apache2/sites-enabled/000-default.conf && \\
    echo '</Directory>' >> /etc/apache2/sites-enabled/000-default.conf && \\
    echo 'DocumentRoot /app/public' >> /etc/apache2/sites-enabled/000-default.conf

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD curl -f http://localhost:{template.default_port}/ || exit 1

# Start Apache
CMD ["apache2-foreground"]
"""
    
    @staticmethod
    def _generate_go(result: StackDetectionResult) -> str:
        """Generate Go Dockerfile"""
        template = StackTemplates.get("go")
        
        return f"""# Generated Dockerfile for {result.framework or 'Go'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR {template.working_directory}

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o app .

# Runtime stage
FROM alpine:latest

WORKDIR {template.working_directory}

# Copy binary from builder
COPY --from=builder {template.working_directory}/app .

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost:{template.default_port}/health || exit 1

# Start application
CMD ["./app"]
"""
    
    @staticmethod
    def _generate_ruby(result: StackDetectionResult) -> str:
        """Generate Ruby Dockerfile"""
        template = StackTemplates.get("ruby")
        
        run_cmd = "bundle exec rails server -b 0.0.0.0 -p 3000" if result.framework == "Rails" else template.run_command
        
        return f"""# Generated Dockerfile for {result.framework or 'Ruby'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM ruby:3.2-slim

WORKDIR {template.working_directory}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    git \\
    postgresql-client \\
    && rm -rf /var/lib/apt/lists/*

# Copy Gemfile
COPY Gemfile Gemfile.lock ./

# Install gems
RUN bundle install

# Copy application
COPY . .

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD curl -f http://localhost:{template.default_port}/ || exit 1

# Start application
CMD {run_cmd}
"""
    
    @staticmethod
    def _generate_java(result: StackDetectionResult) -> str:
        """Generate Java Dockerfile"""
        template = StackTemplates.get("java")
        
        return f"""# Generated Dockerfile for {result.framework or 'Java'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR {template.working_directory}

# Copy pom.xml
COPY pom.xml .

# Download dependencies
RUN mvn dependency:resolve

# Copy source
COPY . .

# Build
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-alpine

WORKDIR {template.working_directory}

# Copy jar from builder
COPY --from=builder {template.working_directory}/target/*.jar app.jar

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost:{template.default_port}/health || exit 1

# Start application
CMD ["java", "-jar", "app.jar"]
"""
    
    @staticmethod
    def _generate_csharp(result: StackDetectionResult) -> str:
        """Generate C# / .NET Dockerfile"""
        template = StackTemplates.get("csharp")
        
        return f"""# Generated Dockerfile for {result.framework or '.NET'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder

WORKDIR {template.working_directory}

# Copy project files
COPY *.csproj ./

# Restore dependencies
RUN dotnet restore

# Copy source
COPY . .

# Build
RUN dotnet build -c Release

# Publish
RUN dotnet publish -c Release -o out

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0

WORKDIR {template.working_directory}

# Copy from builder
COPY --from=builder {template.working_directory}/out .

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD curl -f http://localhost:{template.default_port}/health || exit 1

# Start application
CMD ["dotnet", "*.dll"]
"""
    
    @staticmethod
    def _generate_rust(result: StackDetectionResult) -> str:
        """Generate Rust Dockerfile"""
        template = StackTemplates.get("rust")
        
        return f"""# Generated Dockerfile for {result.framework or 'Rust'} application
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM rust:latest AS builder

WORKDIR {template.working_directory}

# Copy files
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){{}}" > src/main.rs

# Build dependencies (cache layer)
RUN cargo build --release && rm -rf src

# Copy source
COPY src ./src

# Build application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR {template.working_directory}

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder {template.working_directory}/target/release/app .

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD curl -f http://localhost:{template.default_port}/ || exit 1

# Start application
CMD ["./app"]
"""
    
    @staticmethod
    def _generate_static(result: StackDetectionResult) -> str:
        """Generate Static Site Dockerfile"""
        template = StackTemplates.get("static")
        
        return f"""# Generated Dockerfile for {result.framework or 'Static Site'}
# Stack: {result.stack}
# Confidence: {result.confidence_score}%

FROM node:18-alpine

WORKDIR {template.working_directory}

# Install http-server globally
RUN npm install -g http-server

# Copy files
COPY . .

# Expose port
EXPOSE {template.default_port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost:{template.default_port}/ || exit 1

# Start server
CMD ["http-server", "-p", "{template.default_port}"]
"""
    
    @staticmethod
    def _generate_fallback(result: StackDetectionResult) -> str:
        """Generate fallback Dockerfile for unknown stacks"""
        
        return f"""# Generated Dockerfile for unknown stack
# Detected stack: {result.stack}
# Confidence: {result.confidence_score}%
# MANUAL CONFIGURATION REQUIRED

FROM ubuntu:22.04

WORKDIR /app

# Copy files
COPY . .

# TODO: Install dependencies
# RUN apt-get update && apt-get install -y \\
#     build-essential \\
#     && rm -rf /var/lib/apt/lists/*

# Expose port
EXPOSE 3000

# TODO: Setup proper entrypoint
# CMD ["command_to_run_your_app"]
ENTRYPOINT ["/bin/bash"]
"""
