"""Lazy iterators for Wise's seek, cursor and offset pagination."""
from typing import AsyncIterator, Iterator
from .client import WiseClient, AsyncWiseClient
from .generated import Recipient, Activity
from .generated.transfers.types.list_transfers_response_item import ListTransfersResponseItem


class PaginationError(Exception):
    pass


def _limit(max_pages):
    if not isinstance(max_pages, int) or isinstance(max_pages, bool) or max_pages < 1:
        raise ValueError("max_pages must be a positive integer")
    return max_pages


class _Cursor:
    def __init__(self, value, kind):
        self.value, self.kind, self.seen = value, kind, set()

    def check(self):
        if self.value is not None and self.value != "":
            if self.value in self.seen:
                raise PaginationError(f"{self.kind} cursor did not advance")
            self.seen.add(self.value)


def iter_recipients(client: WiseClient, *, max_pages: int = 1000, request_options=None, **filters) -> Iterator[Recipient]:
    cursor = _Cursor(filters.pop("seek_position", None), "Recipient")
    for _ in range(_limit(max_pages)):
        cursor.check()
        page = client.recipients.list(**filters, seek_position=cursor.value, request_options=request_options)
        if page.content is None:
            raise PaginationError("Recipient response has no content array")
        yield from page.content
        cursor.value = page.seek_position_for_next
        if cursor.value is None:
            return
    raise PaginationError("Recipient pagination exceeded max_pages")


async def async_iter_recipients(client: AsyncWiseClient, *, max_pages: int = 1000, request_options=None, **filters) -> AsyncIterator[Recipient]:
    cursor = _Cursor(filters.pop("seek_position", None), "Recipient")
    for _ in range(_limit(max_pages)):
        cursor.check()
        page = await client.recipients.list(**filters, seek_position=cursor.value, request_options=request_options)
        if page.content is None:
            raise PaginationError("Recipient response has no content array")
        for item in page.content:
            yield item
        cursor.value = page.seek_position_for_next
        if cursor.value is None:
            return
    raise PaginationError("Recipient pagination exceeded max_pages")


def iter_activities(client: WiseClient, *, profile_id: int, max_pages: int = 1000, request_options=None, **filters) -> Iterator[Activity]:
    cursor = _Cursor(filters.pop("next_cursor", None), "Activity")
    for _ in range(_limit(max_pages)):
        cursor.check()
        page = client.activities.list(profile_id=profile_id, **filters, next_cursor=cursor.value, request_options=request_options)
        if page.activities is None:
            raise PaginationError("Activity response has no activities array")
        yield from page.activities
        cursor.value = page.cursor
        if not cursor.value:
            return
    raise PaginationError("Activity pagination exceeded max_pages")


async def async_iter_activities(client: AsyncWiseClient, *, profile_id: int, max_pages: int = 1000, request_options=None, **filters) -> AsyncIterator[Activity]:
    cursor = _Cursor(filters.pop("next_cursor", None), "Activity")
    for _ in range(_limit(max_pages)):
        cursor.check()
        page = await client.activities.list(profile_id=profile_id, **filters, next_cursor=cursor.value, request_options=request_options)
        if page.activities is None:
            raise PaginationError("Activity response has no activities array")
        for item in page.activities:
            yield item
        cursor.value = page.cursor
        if not cursor.value:
            return
    raise PaginationError("Activity pagination exceeded max_pages")


def _transfer_request(filters):
    request = {"offset": 0, "limit": 100, **filters}
    for field, minimum in (("offset", 0), ("limit", 1)):
        value = request[field]
        if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
            raise ValueError("Invalid transfer offset or limit")
    return request


def _transfer_page(page, seen):
    if not isinstance(page, list):
        raise PaginationError("Transfer response is not an array")
    if page and all(transfer.id is not None for transfer in page):
        key = tuple(transfer.id for transfer in page)
        if key in seen:
            raise PaginationError("Transfer page repeated")
        seen.add(key)


def iter_transfers(client: WiseClient, *, max_pages: int = 1000, request_options=None, **filters) -> Iterator[ListTransfersResponseItem]:
    request, seen = _transfer_request(filters), set()
    for _ in range(_limit(max_pages)):
        page = client.transfers.list(**request, request_options=request_options)
        _transfer_page(page, seen)
        if not page:
            return
        yield from page
        request["offset"] += len(page)
    raise PaginationError("Transfer pagination exceeded max_pages")


async def async_iter_transfers(client: AsyncWiseClient, *, max_pages: int = 1000, request_options=None, **filters) -> AsyncIterator[ListTransfersResponseItem]:
    request, seen = _transfer_request(filters), set()
    for _ in range(_limit(max_pages)):
        page = await client.transfers.list(**request, request_options=request_options)
        _transfer_page(page, seen)
        if not page:
            return
        for item in page:
            yield item
        request["offset"] += len(page)
    raise PaginationError("Transfer pagination exceeded max_pages")
