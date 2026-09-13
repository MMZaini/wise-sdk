import type { WiseClient } from "./client.js";
import type { BaseRequestOptions } from "./generated/BaseClient.js";
import type { ListRecipientsRequest, ListActivitiesRequest, ListTransfersRequest, Recipient, Activity, ListTransfersResponseItem } from "./generated/api/index.js";

export class PaginationError extends Error {
  constructor(message: string) { super(message); this.name = "PaginationError"; }
}

export interface PaginationOptions {
  /** Fail rather than silently truncate. Defaults to 1000 pages. */
  maxPages?: number;
  requestOptions?: BaseRequestOptions;
}

function limit(options: PaginationOptions): number {
  const pages = options.maxPages ?? 1000;
  if (!Number.isSafeInteger(pages) || pages < 1) throw new RangeError("maxPages must be a positive integer");
  return pages;
}

export async function* iterRecipients(client: WiseClient, request: ListRecipientsRequest = {}, options: PaginationOptions = {}): AsyncGenerator<Recipient> {
  const maxPages = limit(options);
  let cursor = request.seekPosition;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    if (cursor != null) {
      if (seen.has(String(cursor))) throw new PaginationError("Recipient cursor did not advance");
      seen.add(String(cursor));
    }
    const page = await client.recipients.list({ ...request, seekPosition: cursor }, options.requestOptions);
    if (!Array.isArray(page.content)) throw new PaginationError("Recipient response has no content array");
    yield* page.content;
    cursor = page.seekPositionForNext;
    if (cursor == null) return;
  }
  throw new PaginationError("Recipient pagination exceeded maxPages");
}

export async function* iterActivities(client: WiseClient, request: ListActivitiesRequest, options: PaginationOptions = {}): AsyncGenerator<Activity> {
  const maxPages = limit(options);
  let cursor = request.nextCursor;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    if (cursor) {
      if (seen.has(cursor)) throw new PaginationError("Activity cursor did not advance");
      seen.add(cursor);
    }
    const page = await client.activities.list({ ...request, nextCursor: cursor }, options.requestOptions);
    if (!Array.isArray(page.activities)) throw new PaginationError("Activity response has no activities array");
    yield* page.activities;
    cursor = page.cursor ?? undefined;
    if (!cursor) return;
  }
  throw new PaginationError("Activity pagination exceeded maxPages");
}

export async function* iterTransfers(client: WiseClient, request: ListTransfersRequest = {}, options: PaginationOptions = {}): AsyncGenerator<ListTransfersResponseItem> {
  const maxPages = limit(options);
  let offset = request.offset ?? 0;
  const size = request.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(size) || size < 1) throw new RangeError("Invalid transfer offset or limit");
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await client.transfers.list({ ...request, offset, limit: size }, options.requestOptions);
    if (!Array.isArray(page)) throw new PaginationError("Transfer response is not an array");
    if (!page.length) return;
    if (page.every((transfer) => transfer.id != null)) {
      const key = page.map((transfer) => String(transfer.id)).join(",");
      if (seen.has(key)) throw new PaginationError("Transfer page repeated");
      seen.add(key);
    }
    yield* page;
    offset += page.length;
    if (!Number.isSafeInteger(offset)) throw new PaginationError("Transfer offset exceeded the safe integer range");
  }
  throw new PaginationError("Transfer pagination exceeded maxPages");
}
