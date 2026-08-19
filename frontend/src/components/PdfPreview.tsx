import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { api } from '../api'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export default function PdfPreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let loadingTask: pdfjs.PDFDocumentLoadingTask | null = null
    const container = containerRef.current
    if (!container) return

    const render = async () => {
      try {
        const res = await api.get(url, { responseType: 'arraybuffer' })
        loadingTask = pdfjs.getDocument({ data: res.data })
        const doc = await loadingTask.promise
        if (cancelled) return
        container.innerHTML = ''
        const width = container.clientWidth || 800
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const scale = width / base.width
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.className = 'pdf-page'
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = '100%'
          container.appendChild(canvas)
          const ctx = canvas.getContext('2d')!
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          }).promise
        }
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setLoading(false)
          setError(String((e as Error)?.message ?? e))
        }
      }
    }
    void render()
    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [url])

  return (
    <div className="pdf-preview">
      {loading && <p className="mute">[~] 正在加载 PDF 预览…</p>}
      {error && <div className="error">[x] PDF 预览加载失败：{error}</div>}
      <div ref={containerRef} className="pdf-pages" />
    </div>
  )
}
