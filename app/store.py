import io
import os
from shutil import move, rmtree
from PIL import Image

from . import config, exceptions, models


class Store:

    _PAGE_JSON_FILE_NAME = "page.json"
    _GC_VERSION_THRESHOLD = 10

    def __init__(self, config: config.Config):
        self.config = config
        try:
            os.makedirs(self.config.PAGE_DIR, exist_ok=True)
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to create the base directory at {self.config.PAGE_DIR} due to a system error {e}"
            )

    def _sanitize_relative_path(self, user_path: str) -> str:
        relative_user_path = user_path.strip("/")

        absolute_base_dir_path = os.path.realpath(self.config.PAGE_DIR)
        absolute_user_path = os.path.realpath(
            os.path.join(absolute_base_dir_path, os.path.normpath(relative_user_path))
        )

        if not absolute_user_path.startswith(absolute_base_dir_path):
            raise exceptions.StorePermissionError(
                "Access to the path outside of the base directory is not allowed."
            )

        relative_path = os.path.relpath(absolute_user_path, absolute_base_dir_path)
        if relative_path == ".":
            raise exceptions.StorePermissionError(
                "Reference to the base directory is not allowed."
            )

        return relative_path

    def build_page_tree(self) -> dict:
        def _inner_build_directory_tree(current_base_dir: str) -> dict:
            directory_tree = {}
            for entry_name in os.listdir(current_base_dir):
                entry_path = os.path.join(current_base_dir, entry_name)
                if not os.path.isdir(entry_path):
                    continue
                directory_tree[entry_name] = _inner_build_directory_tree(entry_path)
            return directory_tree

        return _inner_build_directory_tree(self.config.PAGE_DIR)

    def search_pages(self, search_query: str) -> list:
        def _inner_search_directory(current_base_dir: str) -> list:
            results = []
            for entry_name in os.listdir(current_base_dir):
                entry_path = os.path.join(current_base_dir, entry_name)
                if not os.path.isdir(entry_path):
                    continue
                file_path = os.path.join(entry_path, Store._PAGE_JSON_FILE_NAME)
                try:
                    with open(file_path) as file:
                        page = models.Page.model_validate_json(file.read())
                        if search_query in page:
                            results.append(
                                f"/{os.path.relpath(entry_path, self.config.PAGE_DIR)}"
                            )
                except FileNotFoundError:
                    raise exceptions.PageNotFoundError(
                        f"Page not found at {entry_path}"
                    )
                except PermissionError:
                    raise exceptions.StorePermissionError(
                        f"Permission denied to read the page at {entry_path}"
                    )
                except OSError as e:
                    raise exceptions.StoreError(
                        f"Failed to read the page at {entry_path} due to a system error {e}"
                    )
                results.extend(_inner_search_directory(entry_path))
            return results

        return _inner_search_directory(self.config.PAGE_DIR)

    def read_page(self, user_path: str) -> models.Page:
        relative_dir_path = self._sanitize_relative_path(user_path)
        absolute_dir_path = os.path.join(self.config.PAGE_DIR, relative_dir_path)
        absolute_file_path = os.path.join(absolute_dir_path, Store._PAGE_JSON_FILE_NAME)
        try:
            with open(absolute_file_path) as file:
                return models.Page.model_validate_json(file.read())
        except FileNotFoundError:
            raise exceptions.PageNotFoundError(f"Page not found at {relative_dir_path}")
        except PermissionError:
            raise exceptions.StorePermissionError(
                f"Permission denied to read the page at {relative_dir_path}"
            )
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to read the page at {relative_dir_path} due to a system error {e}"
            )

    def write_page(self, user_path: str, page: models.Page) -> None:
        relative_dir_path = self._sanitize_relative_path(user_path)
        absolute_dir_path = os.path.join(self.config.PAGE_DIR, relative_dir_path)
        absolute_file_path = os.path.join(absolute_dir_path, Store._PAGE_JSON_FILE_NAME)
        try:
            if not os.path.exists(absolute_dir_path):
                os.mkdir(absolute_dir_path, mode=0o755)
            if page.metadata.version % Store._GC_VERSION_THRESHOLD == 0:
                # Garbage collection of orphaned attachments
                attachments = set(page.attachments())
                for file_name in os.listdir(absolute_dir_path):
                    if os.path.isdir(file_name):
                        continue
                    if file_name == Store._PAGE_JSON_FILE_NAME:
                        continue
                    if file_name in attachments:
                        continue
                    os.remove(os.path.join(absolute_dir_path, file_name))
            with open(absolute_file_path, "w") as file:
                file.write(page.model_dump_json(indent=2))
        except FileNotFoundError:
            raise exceptions.PageNotFoundError(f"Page not found at {relative_dir_path}")
        except PermissionError:
            raise exceptions.StorePermissionError(
                f"Permission denied to write the page at {relative_dir_path}"
            )
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to write the page at {relative_dir_path} due to a system error {e}"
            )

    def delete_page(self, user_path: str) -> None:
        relative_dir_path = self._sanitize_relative_path(user_path)
        absolute_dir_path = os.path.join(self.config.PAGE_DIR, relative_dir_path)
        try:
            rmtree(absolute_dir_path)
        except FileNotFoundError:
            raise exceptions.PageNotFoundError(f"Page not found at {relative_dir_path}")
        except PermissionError:
            raise exceptions.StorePermissionError(
                f"Permission denied to delete the page at {relative_dir_path}"
            )
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to delete the page at {relative_dir_path} due to a system error {e}"
            )

    def rename_page(self, user_path: str, new_user_path: str) -> None:
        old_relative_dir_path = self._sanitize_relative_path(user_path)
        old_absolute_dir_path = os.path.join(
            self.config.PAGE_DIR, old_relative_dir_path
        )
        new_relative_dir_path = self._sanitize_relative_path(new_user_path)
        new_absolute_dir_path = os.path.join(
            self.config.PAGE_DIR, new_relative_dir_path
        )
        try:
            move(old_absolute_dir_path, new_absolute_dir_path)
        except FileNotFoundError:
            raise exceptions.PageNotFoundError(
                f"Page not found at {old_relative_dir_path} or {new_relative_dir_path}"
            )
        except PermissionError:
            raise exceptions.StorePermissionError(
                f"Permission denied to move the page at {old_relative_dir_path} to {new_relative_dir_path}"
            )
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to move the page at {old_relative_dir_path} to {new_relative_dir_path} due to a system error {e}"
            )

    def write_image(
        self, user_path: str, image_name: str, image_content: bytes
    ) -> None:
        relative_dir_path = self._sanitize_relative_path(user_path)
        absolute_dir_path = os.path.join(self.config.PAGE_DIR, relative_dir_path)
        absolute_file_path = os.path.join(absolute_dir_path, image_name)
        try:
            with open(absolute_file_path, "wb") as file:
                file.write(image_content)
        except FileNotFoundError:
            raise exceptions.PageNotFoundError(f"Page not found at {relative_dir_path}")
        except PermissionError:
            raise exceptions.StorePermissionError(
                f"Permission denied to write the image at {relative_dir_path}"
            )
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to write the image at {relative_dir_path} due to a system error {e}"
            )

    def read_image(self, user_image_path: str) -> tuple[bytes, str]:
        relative_file_path = self._sanitize_relative_path(user_image_path)
        absolute_file_path = os.path.join(self.config.PAGE_DIR, relative_file_path)
        try:
            with open(absolute_file_path, "rb") as file:
                content = file.read()
            image = Image.open(io.BytesIO(content))
            image.verify()
            return content, image.format.lower()
        except FileNotFoundError:
            raise exceptions.ImageNotFoundError(
                f"Image not found at {relative_file_path}"
            )
        except PermissionError:
            raise exceptions.StorePermissionError(
                f"Permission denied to read the image at {relative_file_path}"
            )
        except OSError as e:
            raise exceptions.StoreError(
                f"Failed to read the image at {relative_file_path} due to a system error {e}"
            )
