import parse, { type ParsedData } from 'click-parser';

export function parseClickPackage(file: string, getIcon: boolean): Promise<ParsedData> {
  return parse(file, getIcon);
}
