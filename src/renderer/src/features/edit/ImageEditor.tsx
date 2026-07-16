import { useEffect, useState, type ReactElement } from 'react'
import type { Frame } from '@preload/index'
import { loadImage } from '@renderer/lib/image'
import { useAnnotationEditor } from '@renderer/features/annotate/useAnnotationEditor'
import { AnnotationStage } from '@renderer/features/annotate/AnnotationStage'
import { SizePreview } from '@renderer/features/annotate/SizePreview'
import { Toolbar } from '@renderer/features/annotate/Toolbar'
import { editorRoot, fitScale, loadingHint, scaledFootprint, stageScale, toolbarPosition } from './styles'

/** Map an opened image's extension to the MIME used when re-exporting it. */
const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}

/**
 * Image editor window.
 *
 * Opens an existing image (Finder "Open With", argv, or the tray dialog) and runs
 * the same annotation engine as the screenshot overlay — the whole image is the
 * canvas (no region select) and export preserves the original format. The default
 * save writes a copy; overwriting the original is the guarded dropdown action.
 */
export function ImageEditor(): ReactElement {
  const [frame, setFrame] = useState<Frame | null>(null)
  const [ext, setExt] = useState<string>('png')

  useEffect(() => {
    let alive = true
    void window.snapit.getEditSession().then((info) => {
      if (!info) return
      setExt(info.ext)
      void loadImage(info.dataUrl).then((el) => {
        if (alive) {
          setFrame({
            dataUrl: info.dataUrl,
            width: el.naturalWidth,
            height: el.naturalHeight,
            scaleFactor: 1
          })
        }
      })
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.snapit.closeEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!frame) return <div style={{ ...editorRoot, ...loadingHint }}>Opening image…</div>
  return <EditorCanvas frame={frame} mimeType={EXT_MIME[ext]} />
}

function EditorCanvas({ frame, mimeType }: { frame: Frame; mimeType?: string }): ReactElement {
  const editor = useAnnotationEditor(frame, {
    initialBox: { x: 0, y: 0, w: frame.width, h: frame.height },
    regionSelect: false,
    mimeType
  })

  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setWin({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const scale = fitScale(frame.width, frame.height, win.w, win.h)

  // Default is the non-destructive copy; overwriting the original is the dropdown
  // action (main also asks for confirmation before replacing the file).
  const onSaveCopy = (): void => editor.exportImage((url) => void window.snapit.saveEditCopy(url))
  const onOverwrite = (): void => editor.exportImage((url) => void window.snapit.saveEdit(url))

  return (
    <div style={editorRoot}>
      <div style={scaledFootprint(frame.width, frame.height, scale)}>
        <div style={stageScale(scale)}>
          <AnnotationStage editor={editor} width={frame.width} height={frame.height} />
        </div>
      </div>

      <SizePreview preview={editor.sizePreview} />

      <Toolbar
        tool={editor.tool}
        setTool={editor.setTool}
        color={editor.color}
        setColor={editor.setColor}
        canUndo={editor.canUndo}
        onUndo={editor.undo}
        canRedo={editor.canRedo}
        onRedo={editor.redo}
        onCopy={editor.onCopy}
        onSave={onSaveCopy}
        onSaveAs={onOverwrite}
        onCancel={() => window.snapit.closeEditor()}
        saveLabel="Save a copy"
        saveTitle="Save as a new file"
        saveAsLabel="Overwrite original…"
        saveAsTitle="Replaces the original file on disk"
        menuPlacement="up"
        style={toolbarPosition}
      />
    </div>
  )
}
