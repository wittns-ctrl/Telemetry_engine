"""
AI Diagnostics REST API Endpoints

This module provides REST API endpoints for AI-powered hardware diagnostic
analysis, integrating with the AI Diagnostic Service.

Author: Lectio Backend Team
Version: 6.0.0
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId

from app.api.deps import get_current_user
from app.models.user import User
from app.services.ai_diagnostic_service import ai_diagnostic_service
from app.schemas.api import DiagnosticRequest, DiagnosticResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/diagnostics/analyze",
    response_model=DiagnosticResponse,
    summary="Generate AI Diagnostic Report",
    description="Generate an AI-powered diagnostic report for a specific anomaly alert"
)
async def analyze_diagnostic(
    request: DiagnosticRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate an AI-powered diagnostic report for a specific anomaly alert.
    
    This endpoint analyzes the alert and surrounding telemetry context to
    generate actionable troubleshooting recommendations using LLM integration
    with a rule-based fallback matrix.
    
    Args:
        request: Diagnostic request containing alert_id and device_id
        current_user: The authenticated user
        
    Returns:
        DiagnosticResponse with the generated diagnostic report
        
    Raises:
        HTTPException: If alert not found, doesn't belong to user, or analysis fails
    """
    try:
        user_id = str(current_user.id)
        
        # Validate device ID format
        try:
            device_oid = PydanticObjectId(request.device_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid device ID format"
            )
        
        # Validate alert ID format
        try:
            alert_oid = PydanticObjectId(request.alert_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid alert ID format"
            )
        
        # Generate diagnostic report
        try:
            report = await ai_diagnostic_service.generate_diagnostic_report(
                user_id=user_id,
                device_id=request.device_id,
                alert_id=request.alert_id
            )
            
            logger.info(
                f"Diagnostic report generated for alert {request.alert_id} "
                f"by user {user_id} using method: {report.analysis_method}"
            )
            
            return DiagnosticResponse(
                report=report,
                success=True,
                message="Diagnostic report generated successfully"
            )
        
        except ValueError as e:
            logger.error(f"Diagnostic generation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        except Exception as e:
            logger.error(f"Unexpected error during diagnostic generation: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate diagnostic report"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in diagnostic analysis endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get(
    "/diagnostics/health",
    summary="Diagnostic Service Health Check",
    description="Check the health and configuration of the AI diagnostic service"
)
async def diagnostic_health_check():
    """
    Check the health and configuration of the AI diagnostic service.
    
    Returns:
        Dictionary with service status and configuration information
    """
    from app.core.config import settings
    
    has_openai_key = getattr(settings, 'OPENAI_API_KEY', None) is not None
    openai_model = getattr(settings, 'OPENAI_MODEL', 'gpt-4')
    
    return {
        "service": "AI Diagnostic Service",
        "status": "operational",
        "llm_integration": {
            "enabled": has_openai_key,
            "model": openai_model,
            "fallback_available": True
        },
        "rule_based_fallback": {
            "enabled": True,
            "rules_count": 6
        }
    }
