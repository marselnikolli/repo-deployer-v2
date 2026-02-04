"""Export service for repositories"""

import csv
import json
import io
from datetime import datetime
from typing import List, Optional
from models import Repository


class ExportService:
    """Service for exporting repository data to various formats"""

    @staticmethod
    def to_csv(repositories: List[Repository]) -> str:
        """Export repositories to CSV format"""
        output = io.StringIO()
        writer = csv.writer(output)

        # Header row
        writer.writerow([
            'id', 'name', 'url', 'title', 'category', 'description',
            'cloned', 'deployed', 'last_synced', 'created_at', 'updated_at'
        ])

        # Data rows
        for repo in repositories:
            writer.writerow([
                repo.id,
                repo.name,
                repo.url,
                repo.title,
                repo.category,
                repo.description or '',
                repo.cloned,
                repo.deployed,
                repo.last_synced.isoformat() if repo.last_synced else '',
                repo.created_at.isoformat() if repo.created_at else '',
                repo.updated_at.isoformat() if repo.updated_at else ''
            ])

        return output.getvalue()

    @staticmethod
    def to_json(repositories: List[Repository]) -> str:
        """Export repositories to JSON format"""
        data = {
            "exported_at": datetime.utcnow().isoformat(),
            "total": len(repositories),
            "repositories": [
                {
                    "id": repo.id,
                    "name": repo.name,
                    "url": repo.url,
                    "title": repo.title,
                    "category": repo.category,
                    "description": repo.description,
                    "cloned": repo.cloned,
                    "deployed": repo.deployed,
                    "last_synced": repo.last_synced.isoformat() if repo.last_synced else None,
                    "created_at": repo.created_at.isoformat() if repo.created_at else None,
                    "updated_at": repo.updated_at.isoformat() if repo.updated_at else None
                }
                for repo in repositories
            ]
        }
        return json.dumps(data, indent=2)

    @staticmethod
    def to_markdown(repositories: List[Repository]) -> str:
        """Export repositories to Markdown format"""
        lines = [
            f"# Repository Export",
            f"",
            f"Exported at: {datetime.utcnow().isoformat()}",
            f"Total repositories: {len(repositories)}",
            f"",
            f"---",
            f""
        ]

        # Group by category
        categories = {}
        for repo in repositories:
            cat = repo.category or 'uncategorized'
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(repo)

        for category, repos in sorted(categories.items()):
            lines.append(f"## {category.replace('_', ' ').title()} ({len(repos)})")
            lines.append("")
            for repo in repos:
                status = []
                if repo.cloned:
                    status.append("cloned")
                if repo.deployed:
                    status.append("deployed")
                status_str = f" [{', '.join(status)}]" if status else ""
                lines.append(f"- [{repo.name}]({repo.url}){status_str}")
                if repo.title and repo.title != repo.name:
                    lines.append(f"  - {repo.title}")
            lines.append("")

        return "\n".join(lines)
