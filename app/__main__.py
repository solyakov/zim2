import io
import uuid
from fastapi import Depends, FastAPI, Query, Request, Response, status, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from . import config, exceptions, models, store

from loguru import logger

app = FastAPI()

# TODO: WAL for changes

@app.exception_handler(exceptions.StoreError)
async def store_error_handler(_request: Request, _exc: exceptions.StoreError):
    return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@app.exception_handler(exceptions.StorePermissionError)
async def store_permission_error_handler(
    _request: Request, _exc: exceptions.StorePermissionError
):
    return Response(status_code=status.HTTP_403_FORBIDDEN)


@app.exception_handler(exceptions.PageNotFoundError)
async def page_not_found_error_handler(
    _request: Request, _exc: exceptions.PageNotFoundError
):
    return Response(status_code=status.HTTP_404_NOT_FOUND)


@app.exception_handler(exceptions.PageChangeConflictError)
async def page_change_conflict_error_handler(
    _request: Request, _exc: exceptions.PageChangeConflictError
):
    return Response(status_code=status.HTTP_409_CONFLICT)


def get_store():
    return store.Store(config.config)


@app.get("/api/v1/pages/{user_path:path}")
@logger.catch
async def get_single_page(user_path: str, store: store.Store = Depends(get_store)):
    return store.read_page(user_path)


@app.get("/api/v1/pages")
@logger.catch
async def list_pages(store: store.Store = Depends(get_store)):
    return store.build_page_tree()


@app.get("/api/v1/search")
@logger.catch
async def search_pages(
    search_query: str = Query(None, alias="q"),
    store: store.Store = Depends(get_store),
):
    return store.search_pages(search_query)


@app.post("/api/v1/batch")
@logger.catch
async def process_batch_changes(
    batch: models.Batch, store: store.Store = Depends(get_store)
):
    for user_path, change in batch.changes.items():
        page = store.read_page(user_path)
        page.change(change)
        store.write_page(user_path=user_path, page=page)


@app.post("/api/v1/pages/{user_path:path}")
@logger.catch
async def create_page(user_path: str, store: store.Store = Depends(get_store)):
    title = user_path.split("/")[-1]
    store.write_page(user_path=user_path, page=models.Page.create(title))


@app.delete("/api/v1/pages/{user_path:path}")
@logger.catch
async def delete_page(user_path: str, store: store.Store = Depends(get_store)):
    store.delete_page(user_path)


@app.patch("/api/v1/pages/{user_path:path}")
@logger.catch
async def patch_page(
    patch: models.Patch, user_path: str, store: store.Store = Depends(get_store)
):
    match patch:
        case models.Patch(type="move", data=data):
            store.rename_page(user_path=user_path, new_user_path=data)
        case _:
            return Response(status_code=status.HTTP_400_BAD_REQUEST)


@app.post("/api/v1/images/{user_path:path}")
@logger.catch
async def create_image(
    user_path: str,
    store: store.Store = Depends(get_store),
    file: UploadFile = File(...),
):
    if not file.content_type.startswith("image/"):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"message": "Invalid file type"},
        )
    content = await file.read()
    try:
        image = Image.open(io.BytesIO(content))
        image.verify()
    except Exception:
        raise JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"message": "Uploaded file is not a valid image"},
        )
    file_extension = image.format.lower()
    file_name = f"{uuid.uuid4()}.{file_extension}"
    store.write_image(user_path=user_path, image_name=file_name, image_content=content)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"url": f"/api/v1/images/{user_path}/{file_name}"},
    )


@app.get("/api/v1/images/{user_image_path:path}")
@logger.catch
async def get_image(user_image_path: str, store: store.Store = Depends(get_store)):
    content, content_type = store.read_image(user_image_path=user_image_path)
    return Response(content=content, media_type=f"image/{content_type}")


app.mount(
    "/", StaticFiles(directory=config.config.STATIC_DIR, html=True), name="static"
)
