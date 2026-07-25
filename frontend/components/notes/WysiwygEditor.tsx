'use client';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { PluginKey } from '@tiptap/pm/state';
import tippy from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Bold, Italic, Strikethrough, Underline as UnderlineIcon, Heading1, Heading2, List, ListOrdered, CheckSquare, Quote, Code, Link as LinkIcon, Table as TableIcon, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, PaintBucket, Eraser, Undo, Redo } from 'lucide-react';
import { apiFetch, API_BASE } from '@/lib/api';

const mentionKey = new PluginKey('mention');

const SuggestionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) props.command({ id: `${item.type}:${item.id}`, label: item.fullName });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    }
  }));

  if (!props.items.length) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      {props.items.map((item: any, index: number) => (
        <button
          key={item.id}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
            background: index === selectedIndex ? '#f0f0f0' : '#fff',
            border: 'none', cursor: 'pointer',
            fontSize: 14
          }}
          onClick={() => selectItem(index)}
        >
          {item.type === 'client' ? '🏢 ' : '👤 '}
          {item.fullName}
        </button>
      ))}
    </div>
  );
});
SuggestionList.displayName = 'SuggestionList';

export default function WysiwygEditor({ content, onChange }: { content: string, onChange: (val: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Write a note... Use @ to tag users or clients.' }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: async ({ query }) => {
            if (!query) return [];
            try {
              const res = await apiFetch(`/api/notes/mentions-search?q=${encodeURIComponent(query)}`);
              const users = (res.users || []).map((u: any) => ({ ...u, type: 'user' }));
              const clients = (res.clients || []).map((c: any) => ({ ...c, type: 'client' }));
              return [...users, ...clients].slice(0, 10);
            } catch {
              return [];
            }
          },
          render: () => {
            let component: any;
            let popup: any;
            return {
              onStart: props => {
                component = new ReactRenderer(SuggestionList, { props, editor: props.editor });
                if (!props.clientRect) return;
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as any,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start'
                });
              },
              onUpdate: props => {
                component?.updateProps(props);
                if (!props.clientRect) return;
                popup?.[0].setProps({ getReferenceClientRect: props.clientRect as any });
              },
              onKeyDown: props => {
                if (props.event.key === 'Escape') {
                  popup?.[0].hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props);
              },
              onExit: () => {
                popup?.[0].destroy();
                component?.destroy();
              }
            };
          }
        }
      })
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    immediatelyRender: false
  });

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/api/notes/upload`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        editor?.chain().focus().setImage({ src: data.url }).run();
      }
    } catch (err) {
      console.error('Image upload failed', err);
    }
  };

  if (!editor) return null;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', background: 'var(--surface)' }}>
        <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="editor-btn" title="Undo (Ctrl+Z)"><Undo size={16} /></button>
        <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="editor-btn" title="Redo (Ctrl+Y)"><Redo size={16} /></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={`editor-btn ${editor.isActive('bold') ? 'active' : ''}`}><Bold size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`editor-btn ${editor.isActive('italic') ? 'active' : ''}`}><Italic size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`editor-btn ${editor.isActive('underline') ? 'active' : ''}`}><UnderlineIcon size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`editor-btn ${editor.isActive('strike') ? 'active' : ''}`}><Strikethrough size={16} /></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`editor-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}><Heading1 size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`editor-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}><Heading2 size={16} /></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`editor-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}><AlignLeft size={16} /></button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`editor-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}><AlignCenter size={16} /></button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`editor-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}><AlignRight size={16} /></button>
        <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`editor-btn ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`}><AlignJustify size={16} /></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => {
          if (editor.isActive('orderedList')) editor.chain().focus().liftListItem('listItem').toggleBulletList().run();
          else editor.chain().focus().toggleBulletList().run();
        }} className={`editor-btn ${editor.isActive('bulletList') ? 'active' : ''}`}><List size={16} /></button>
        
        <button onClick={() => {
          if (editor.isActive('bulletList')) editor.chain().focus().liftListItem('listItem').toggleOrderedList().run();
          else editor.chain().focus().toggleOrderedList().run();
        }} className={`editor-btn ${editor.isActive('orderedList') ? 'active' : ''}`}><ListOrdered size={16} /></button>
        
        <button onClick={() => {
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) editor.chain().focus().liftListItem('listItem').toggleTaskList().run();
          else editor.chain().focus().toggleTaskList().run();
        }} className={`editor-btn ${editor.isActive('taskList') ? 'active' : ''}`}><CheckSquare size={16} /></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`editor-btn ${editor.isActive('blockquote') ? 'active' : ''}`}><Quote size={16} /></button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`editor-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}><Code size={16} /></button>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => {
          const url = window.prompt('URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
          else editor.chain().focus().unsetLink().run();
        }} className={`editor-btn ${editor.isActive('link') ? 'active' : ''}`}><LinkIcon size={16} /></button>
        <button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="editor-btn"><TableIcon size={16} /></button>
        <label className="editor-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageIcon size={16} />
          <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => {
            if (e.target.files?.[0]) uploadImage(e.target.files[0]);
          }} />
        </label>
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <label className="editor-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }} title="Text Color">
          <Type size={16} />
          <input 
            type="color" 
            onInput={(e) => editor.chain().focus().setColor(e.currentTarget.value).run()} 
            value={editor.getAttributes('textStyle').color || '#000000'}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} 
          />
        </label>
        <label className="editor-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }} title="Background Color">
          <PaintBucket size={16} />
          <input 
            type="color" 
            onInput={(e) => editor.chain().focus().setHighlight({ color: e.currentTarget.value }).run()} 
            value={editor.getAttributes('highlight').color || '#ffffff'}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} 
          />
        </label>
        <button onClick={() => editor.chain().focus().unsetAllMarks().run()} className="editor-btn" title="Clear Formatting"><Eraser size={16} /></button>
      </div>
      <EditorContent editor={editor} className="tiptap-editor" style={{ padding: 16, minHeight: 200 }} />
      <style>{`
        .editor-btn {
          background: transparent;
          border: none;
          padding: 6px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--ink-2);
          display: flex;
        }
        .editor-btn:disabled { opacity: 0.3; cursor: 'not-allowed'; }
        .editor-btn:hover:not(:disabled) { background: var(--surface-2); }
        .editor-btn.active { background: var(--olive-50); color: var(--olive); }
        .tiptap-editor .ProseMirror { outline: none; min-height: 200px; }
        .tiptap-editor ul, .tiptap-editor ol { padding-left: 24px; margin-bottom: 1em; }
        .tiptap-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--soft);
          pointer-events: none;
          height: 0;
        }
        .tiptap-editor img { max-width: 100%; border-radius: 4px; }
        .mention { background: #e0e7ff; color: #4338ca; padding: 2px 4px; border-radius: 4px; font-weight: 500; }
        .tiptap-editor ul[data-type="taskList"] { list-style: none; padding: 0; }
        .tiptap-editor ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .tiptap-editor ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 4px; }
        .tiptap-editor table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 0; overflow: hidden; }
        .tiptap-editor td, .tiptap-editor th { min-width: 1em; border: 1px solid var(--border); padding: 3px 5px; vertical-align: top; box-sizing: border-box; position: relative; }
        .tiptap-editor th { font-weight: bold; text-align: left; background-color: var(--surface-2); }
      `}</style>
    </div>
  );
}
