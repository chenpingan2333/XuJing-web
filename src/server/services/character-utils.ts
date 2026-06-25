export function nullIfEmpty(val: string | null | undefined): string | null {
  if (!val || val.trim() === "") return null;
  return val;
}

export function undefToNull(val: any) {
  return val === undefined ? null : val;
}

export function toInsertData(input: any) {
  const data = { ...input };
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) {
      data[key] = null;
    }
  }
  return data;
}
