from fastapi import APIRouter

from app.api.admin import router as admin_router
from app.api.documents import router as documents_router
from app.api.forum import router as forum_router
from app.api.graph import router as graph_router
from app.api.insights import router as insights_router
from app.api.templates import router as templates_router
from app.api.team_chat import router as team_chat_router
from app.api.team_growth import router as team_growth_router
from app.api.teams import router as teams_router
from app.api.users import router as users_router
from app.api.workbench import router as workbench_router
from app.api.query import router as query_router

router = APIRouter()
router.include_router(users_router)
router.include_router(documents_router)
router.include_router(admin_router)
router.include_router(graph_router)
router.include_router(workbench_router)
router.include_router(insights_router)
router.include_router(templates_router)
router.include_router(query_router)
router.include_router(forum_router)
router.include_router(teams_router)
router.include_router(team_growth_router)
router.include_router(team_chat_router)
