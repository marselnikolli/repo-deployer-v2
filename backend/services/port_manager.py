"""Port management service for dynamic port allocation"""

import logging
from typing import Optional, Set, List

logger = logging.getLogger(__name__)


class PortManager:
    """Manages dynamic port allocation for deployments"""
    
    # Port range for deployments
    MIN_PORT = 20000
    MAX_PORT = 40000
    
    def __init__(self):
        """Initialize port manager"""
        self.allocated_ports: Set[int] = set()
        self.port_to_repo: dict[int, str] = {}  # port -> repo_name mapping
    
    def allocate_port(self, repo_name: str) -> int:
        """Allocate an available port for a repository
        
        Args:
            repo_name: Name of the repository
            
        Returns:
            Allocated port number
            
        Raises:
            RuntimeError: If no ports available
        """
        # Check if repo already has a port
        for port, name in self.port_to_repo.items():
            if name == repo_name:
                return port
        
        # Find next available port
        for port in range(self.MIN_PORT, self.MAX_PORT + 1):
            if port not in self.allocated_ports:
                self.allocated_ports.add(port)
                self.port_to_repo[port] = repo_name
                logger.info(f"Allocated port {port} to {repo_name}")
                return port
        
        raise RuntimeError(f"No available ports in range {self.MIN_PORT}-{self.MAX_PORT}")
    
    def release_port(self, port: int) -> bool:
        """Release an allocated port
        
        Args:
            port: Port number to release
            
        Returns:
            True if port was allocated and released, False otherwise
        """
        if port in self.allocated_ports:
            self.allocated_ports.discard(port)
            repo_name = self.port_to_repo.pop(port, None)
            logger.info(f"Released port {port}" + (f" from {repo_name}" if repo_name else ""))
            return True
        return False
    
    def is_allocated(self, port: int) -> bool:
        """Check if a port is allocated
        
        Args:
            port: Port number
            
        Returns:
            True if allocated, False otherwise
        """
        return port in self.allocated_ports
    
    def get_repo_for_port(self, port: int) -> Optional[str]:
        """Get repository name for a port
        
        Args:
            port: Port number
            
        Returns:
            Repository name or None if not allocated
        """
        return self.port_to_repo.get(port)
    
    def get_port_for_repo(self, repo_name: str) -> Optional[int]:
        """Get port for a repository
        
        Args:
            repo_name: Repository name
            
        Returns:
            Port number or None if not allocated
        """
        for port, name in self.port_to_repo.items():
            if name == repo_name:
                return port
        return None
    
    def get_allocated_ports(self) -> List[int]:
        """Get list of allocated ports
        
        Returns:
            List of allocated port numbers
        """
        return sorted(list(self.allocated_ports))
    
    def get_available_count(self) -> int:
        """Get number of available ports
        
        Returns:
            Count of available ports
        """
        return (self.MAX_PORT - self.MIN_PORT + 1) - len(self.allocated_ports)
    
    def reserve_port(self, port: int, repo_name: str) -> bool:
        """Reserve a specific port
        
        Args:
            port: Port number to reserve
            repo_name: Repository name
            
        Returns:
            True if reserved successfully, False if already allocated
        """
        if self.MIN_PORT <= port <= self.MAX_PORT and port not in self.allocated_ports:
            self.allocated_ports.add(port)
            self.port_to_repo[port] = repo_name
            logger.info(f"Reserved port {port} for {repo_name}")
            return True
        return False
    
    def clear(self):
        """Clear all allocated ports (useful for testing or reset)"""
        self.allocated_ports.clear()
        self.port_to_repo.clear()
        logger.info("Cleared all allocated ports")
    
    def __repr__(self) -> str:
        return f"<PortManager allocated={len(self.allocated_ports)}/{self.MAX_PORT - self.MIN_PORT + 1}>"


# Global singleton instance
_port_manager: Optional[PortManager] = None


def get_port_manager() -> PortManager:
    """Get or create global port manager instance"""
    global _port_manager
    if _port_manager is None:
        _port_manager = PortManager()
    return _port_manager


def allocate_port(repo_name: str) -> int:
    """Convenience function to allocate port"""
    return get_port_manager().allocate_port(repo_name)


def release_port(port: int) -> bool:
    """Convenience function to release port"""
    return get_port_manager().release_port(port)


def get_port_for_repo(repo_name: str) -> Optional[int]:
    """Convenience function to get port for repo"""
    return get_port_manager().get_port_for_repo(repo_name)
