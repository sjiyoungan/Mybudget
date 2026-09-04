import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { PdfTextItem } from '@/lib/paystub'

GlobalWorkerOptions.workerSrc = pdfWorker

export async function countPdfPages(file: File): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  return pdf.numPages
}

export async function extractPdfTextItems(
  file: File,
  pages?: number[],
): Promise<PdfTextItem[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const items: PdfTextItem[] = []
  const wanted =
    pages && pages.length > 0 ? new Set(pages) : null

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (wanted && !wanted.has(pageNumber)) continue
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [, , , , x, y] = item.transform
      items.push({ str: item.str, x, y, page: pageNumber })
    }
  }

  return items
}
