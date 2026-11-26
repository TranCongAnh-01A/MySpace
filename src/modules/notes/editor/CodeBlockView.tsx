import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { common } from 'lowlight';
import { useT } from '@/lib/i18n';

export const CODE_LANGUAGES = Object.keys(common).sort();

/** Code block có ô chọn ngôn ngữ ở góc; ngôn ngữ nằm trong `attrs.language` (khớp `[a-z0-9+#-]`). */
export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const t = useT();
  const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
  return (
    <NodeViewWrapper className="note-codeblock">
      <select
        contentEditable={false}
        aria-label={t('notes.codeLang')}
        value={language}
        onChange={(e) => updateAttributes({ language: e.target.value || null })}
        className="note-codeblock-lang"
      >
        <option value="">{t('notes.codeLangAuto')}</option>
        {language && !CODE_LANGUAGES.includes(language) && (
          <option value={language}>{language}</option>
        )}
        {CODE_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
