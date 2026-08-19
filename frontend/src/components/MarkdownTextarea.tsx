import { useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

function renderMarkdown(text: string) {
  return { __html: DOMPurify.sanitize(marked.parse(text ?? '', { async: false })) }
}

interface Props {
  value: string
  rows?: number
  placeholder?: string
  onChange: (value: string) => void
}

export default function MarkdownTextarea({ value, rows = 3, placeholder, onChange }: Props) {
  const [preview, setPreview] = useState(false)
  return (
    <div className="md-editor">
      <div className="md-tabs">
        <button
          type="button"
          className={`md-tab ${!preview ? 'active' : ''}`}
          onClick={() => setPreview(false)}
        >
          编写
        </button>
        <button
          type="button"
          className={`md-tab ${preview ? 'active' : ''}`}
          onClick={() => setPreview(true)}
        >
          预览
        </button>
        <span className="mute md-hint">支持 Markdown 格式</span>
      </div>
      {preview ? (
        <div className="md-preview" dangerouslySetInnerHTML={renderMarkdown(value)} />
      ) : (
        <textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
