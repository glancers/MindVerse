import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

/** AI 消息的 Markdown 渲染（样式见 index.css 的 .md-body，全部走主题变量）；空内容不渲染，避免空壳 div */
export default function Markdown({ content }: { content: string }) {
  if (!content.trim()) return null
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
    </div>
  )
}
