import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import type { PdfTextItem } from '@/lib/paystub'

GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractPdfTextItems(file: File): Promise<PdfTextItem[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const items: PdfTextItem[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
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
