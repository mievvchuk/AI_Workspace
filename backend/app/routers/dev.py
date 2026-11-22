from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ChatSession, DevCategory, Message, Project, StoredFile, User
from ..schemas import ActivityItem, CategoryIn, CategoryOut, FileOut, ProjectIn, ProjectOut, ProjectPatch
from ..security import current_user
from ..services.files import remove_file, schedule_processing, store_upload
from .common import get_owned

router = APIRouter(prefix="/api", tags=["dev"])


# ---------------- categories ----------------


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[DevCategory]:
    return list((await db.scalars(select(DevCategory).where(DevCategory.user_id == user.id).order_by(DevCategory.position, DevCategory.created_at))).all())


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> DevCategory:
    position = (await db.scalar(select(func.coalesce(func.max(DevCategory.position), -1)).where(DevCategory.user_id == user.id))) + 1
    category = DevCategory(user_id=user.id, name=body.name.strip(), position=position)
    db.add(category)
    await db.commit()
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def rename_category(category_id: str, body: CategoryIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> DevCategory:
    category = await get_owned(db, DevCategory, category_id, user.id, "Категорію")
    category.name = body.name.strip()
    await db.commit()
    return category


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    """Projects are kept and become uncategorized."""
    await db.delete(await get_owned(db, DevCategory, category_id, user.id, "Категорію"))
    await db.commit()


# ---------------- projects ----------------


async def _project_counts(db: AsyncSession, user_id: str) -> tuple[dict[str, int], dict[str, int]]:
    files = dict((await db.execute(select(StoredFile.project_id, func.count()).where(StoredFile.user_id == user_id).group_by(StoredFile.project_id))).all())
    sessions = dict((await db.execute(select(ChatSession.project_id, func.count()).where(ChatSession.user_id == user_id).group_by(ChatSession.project_id))).all())
    return files, sessions


def _project_out(p: Project, counts: tuple[dict[str, int], dict[str, int]]) -> ProjectOut:
    out = ProjectOut.model_validate(p)
    out.file_count = counts[0].get(p.id, 0)
    out.session_count = counts[1].get(p.id, 0)
    return out


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[ProjectOut]:
    projects = (await db.scalars(select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc()))).all()
    counts = await _project_counts(db, user.id)
    return [_project_out(p, counts) for p in projects]


def _clean_stack(stack: list[str]) -> list[str]:
    """Trim, split pasted comma lists ("React, Vite") and drop case-insensitive duplicates."""
    seen: list[str] = []
    for item in (part.strip() for s in stack for part in s.split(",")):
        if item and item.lower() not in (x.lower() for x in seen):
            seen.append(item)
    return seen


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> ProjectOut:
    if body.category_id:
        await get_owned(db, DevCategory, body.category_id, user.id, "Категорію")
    project = Project(user_id=user.id, name=body.name.strip(), description=body.description.strip(), stack=_clean_stack(body.stack), category_id=body.category_id)
    db.add(project)
    await db.commit()
    return _project_out(project, ({}, {}))


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> ProjectOut:
    project = await get_owned(db, Project, project_id, user.id, "Проєкт")
    return _project_out(project, await _project_counts(db, user.id))


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, body: ProjectPatch, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> ProjectOut:
    project = await get_owned(db, Project, project_id, user.id, "Проєкт")
    data = body.model_dump(exclude_unset=True)
    if data.get("category_id"):
        await get_owned(db, DevCategory, data["category_id"], user.id, "Категорію")
    if "stack" in data and data["stack"] is not None:
        data["stack"] = _clean_stack(data["stack"])
    for key, value in data.items():
        if key == "name" and value:
            value = value.strip()
        setattr(project, key, value)
    await db.commit()
    return _project_out(project, await _project_counts(db, user.id))


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> None:
    project = await get_owned(db, Project, project_id, user.id, "Проєкт")
    for f in (await db.scalars(select(StoredFile).where(StoredFile.project_id == project.id))).all():
        await remove_file(db, f)
    await db.delete(project)
    await db.commit()


@router.get("/projects/{project_id}/files", response_model=list[FileOut])
async def list_project_files(project_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[StoredFile]:
    await get_owned(db, Project, project_id, user.id, "Проєкт")
    return list((await db.scalars(select(StoredFile).where(StoredFile.project_id == project_id).order_by(StoredFile.created_at.desc()))).all())


@router.post("/projects/{project_id}/files", response_model=FileOut, status_code=201)
async def upload_project_file(
    project_id: str, background: BackgroundTasks, file: UploadFile = File(...), user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> StoredFile:
    await get_owned(db, Project, project_id, user.id, "Проєкт")
    record = await store_upload(db, user.id, file, project_id=project_id)
    await schedule_processing(background, db, record)
    return record


@router.get("/projects/{project_id}/activity", response_model=list[ActivityItem])
async def project_activity(project_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> list[ActivityItem]:
    """Real activity derived from stored records (sessions, files, messages)."""
    await get_owned(db, Project, project_id, user.id, "Проєкт")
    items: list[ActivityItem] = []
    sessions = (await db.scalars(select(ChatSession).where(ChatSession.project_id == project_id))).all()
    for s in sessions:
        items.append(ActivityItem(kind="session", title=f"Створено сесію «{s.title}»", at=s.created_at, ref_id=s.id))
    for f in (await db.scalars(select(StoredFile).where(StoredFile.project_id == project_id))).all():
        items.append(ActivityItem(kind="file", title=f"Додано файл {f.original_name}", at=f.created_at, ref_id=f.id))
    if sessions:
        rows = (
            await db.execute(
                select(Message.session_id, func.count(), func.max(Message.created_at))
                .where(Message.session_id.in_([s.id for s in sessions]), Message.role == "user")
                .group_by(Message.session_id)
            )
        ).all()
        titles = {s.id: s.title for s in sessions}
        for sid, count, last in rows:
            items.append(ActivityItem(kind="message", title=f"{count} повідомл. у «{titles[sid]}»", at=last, ref_id=sid))
    items.sort(key=lambda i: i.at, reverse=True)
    return items[:30]
