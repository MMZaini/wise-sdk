// JSON source access and rawJSON are available in the supported Node 22+ runtime.
const nativeJson = JSON as JSON & {
  rawJSON(value: string): unknown;
  parse(text: string, reviver: (this: unknown, key: string, value: unknown, context: { source?: string }) => unknown): unknown;
};

/** Parse large integer IDs as bigint, safe integers and decimal amounts as number. */
export function fromJson<T = unknown>(
  text: string,
  reviver?: (this: unknown, key: string, value: unknown) => unknown,
): T {
  return nativeJson.parse(text, function (this: unknown, key: string, value: unknown, context: { source?: string }) {
    if (typeof value === "number") {
      if (context.source && /^-?\d+$/.test(context.source) && !Number.isSafeInteger(value)) value = BigInt(context.source);
      else if (!Number.isFinite(value)) throw new RangeError("JSON number exceeds the supported range");
    }
    return reviver ? reviver.call(this, key, value) : value;
  }) as T;
}

/** Serialize bigint IDs as JSON numbers without changing ordinary strings. */
export function toJson(
  data: unknown,
  replacer?: (key: string, value: unknown) => unknown,
  space?: string | number,
): string {
  // Fern's internal signature is string; undefined bodies remain undefined at runtime.
  return JSON.stringify(data, (key, value) => {
    const transformed = replacer ? replacer(key, value) : value;
    if (typeof transformed === "number" && (!Number.isFinite(transformed) ||
        (Number.isInteger(transformed) && !Number.isSafeInteger(transformed)))) {
      throw new RangeError("Use bigint for integers outside JavaScript's safe integer range");
    }
    return typeof transformed === "bigint" ? nativeJson.rawJSON(transformed.toString()) : transformed;
  }, space)!;
}
