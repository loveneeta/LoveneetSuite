/**
 * Universal XML DOM Parser and Serializer
 * Works seamlessly in Browser (native window.DOMParser) and Node.js (@xmldom/xmldom).
 * Completely eliminates fragile string replacements on OpenXML packages.
 */

import { DOMParser as NodeDOMParser, XMLSerializer as NodeXMLSerializer } from "@xmldom/xmldom";

export function getXmlParser(): DOMParser {
  if (typeof window !== "undefined" && window.DOMParser) {
    return new window.DOMParser();
  }
  return new NodeDOMParser() as unknown as DOMParser;
}

export function getXmlSerializer(): XMLSerializer {
  if (typeof window !== "undefined" && window.XMLSerializer) {
    return new window.XMLSerializer();
  }
  return new NodeXMLSerializer() as unknown as XMLSerializer;
}

export function parseXmlDocument(xmlStr: string): Document {
  const parser = getXmlParser();
  const doc = parser.parseFromString(xmlStr, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError && parseError.length > 0) {
    throw new Error(`XML Parse Error: ${parseError[0].textContent}`);
  }
  return doc;
}

export function serializeXmlDocument(doc: Document | Node): string {
  const serializer = getXmlSerializer();
  return serializer.serializeToString(doc);
}
