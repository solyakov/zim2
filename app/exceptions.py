class PageError(Exception):
    pass


class PageNotFoundError(PageError):
    pass


class PageChangeConflictError(PageError):
    pass


class StoreError(Exception):
    pass


class StorePermissionError(StoreError):
    pass
