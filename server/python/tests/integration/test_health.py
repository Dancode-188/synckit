"""
Integration tests for health endpoint
"""

import pytest
from fastapi.testclient import TestClient

from synckit_server.main import app


class TestHealthEndpoint:
    """Test the /health endpoint"""

    @pytest.fixture
    def client(self):
        """Create a test client"""
        return TestClient(app)

    def test_health_endpoint_returns_200(self, client):
        """Test that health endpoint returns 200 OK"""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_endpoint_returns_json(self, client):
        """Test that health endpoint returns JSON"""
        response = client.get("/health")
        assert response.headers["content-type"] == "application/json"

    def test_health_endpoint_contains_status(self, client):
        """Test that health response contains status field"""
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"

    def test_health_endpoint_contains_version(self, client):
        """Test that health response contains version"""
        response = client.get("/health")
        data = response.json()
        assert "version" in data

    def test_health_endpoint_contains_timestamp(self, client):
        """Test that health response contains timestamp"""
        response = client.get("/health")
        data = response.json()
        assert "timestamp" in data


class TestRootEndpoint:
    """Test the / root endpoint"""

    @pytest.fixture
    def client(self):
        """Create a test client"""
        return TestClient(app)

    def test_root_endpoint_returns_200(self, client):
        """Test that root endpoint returns 200 OK"""
        response = client.get("/")
        assert response.status_code == 200

    def test_root_endpoint_returns_json(self, client):
        """Test that root endpoint returns JSON"""
        response = client.get("/")
        assert response.headers["content-type"] == "application/json"

    def test_root_endpoint_contains_name(self, client):
        """Test that root response contains name"""
        response = client.get("/")
        data = response.json()
        assert "name" in data
        assert "SyncKit" in data["name"]

    def test_root_endpoint_contains_endpoints(self, client):
        """Test that root response lists available endpoints"""
        response = client.get("/")
        data = response.json()
        assert "endpoints" in data
        assert "health" in data["endpoints"]
        assert "ws" in data["endpoints"]
