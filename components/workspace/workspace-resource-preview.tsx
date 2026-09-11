'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ResourceImage {
  key: string;
  name: string;
  url: string;
  local: boolean;
}

export function WorkspaceResourcePreview({
  image,
  images,
  saving,
  feedback,
  onSelect,
  onClose,
  onDownload,
  onRestoreFocus,
}: {
  image: ResourceImage | undefined;
  images: ResourceImage[];
  saving: boolean;
  feedback: { text: string; error?: boolean } | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  onDownload: () => void;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog
      open={Boolean(image)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {image ? (
        <PreviewContent
          key={image.key}
          image={image}
          images={images}
          saving={saving}
          feedback={feedback}
          onSelect={onSelect}
          onDownload={onDownload}
          onRestoreFocus={onRestoreFocus}
        />
      ) : null}
    </Dialog>
  );
}

function PreviewContent({
  image,
  images,
  saving,
  feedback,
  onSelect,
  onDownload,
  onRestoreFocus,
}: {
  image: ResourceImage;
  images: ResourceImage[];
  saving: boolean;
  feedback: { text: string; error?: boolean } | null;
  onSelect: (key: string) => void;
  onDownload: () => void;
  onRestoreFocus: () => void;
}) {
  const [original, setOriginal] = React.useState(false);
  const [state, setState] = React.useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [dimensions, setDimensions] = React.useState('');
  const index = images.findIndex((item) => item.key === image.key);
  const move = (offset: number) => {
    const next = images[index + offset];
    if (next) onSelect(next.key);
  };

  return (
    <DialogContent
      className="resource-preview"
      overlayClassName="resource-preview-overlay"
      showCloseButton={false}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <header className="resource-preview-header">
        <div className="resource-preview-heading">
          <DialogTitle className="resource-preview-title">
            {image.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            图片预览。使用左右方向键切换图片，Escape 关闭。
          </DialogDescription>
          <span className="resource-secondary" aria-live="polite">
            {dimensions || '图片预览'}
          </span>
        </div>
        <div className="resource-actions">
          {image.local ? (
            <button
              className="resource-button"
              type="button"
              disabled={saving}
              onClick={onDownload}
            >
              <Download aria-hidden="true" size={16} />
              {saving ? '保存中…' : '下载图片'}
            </button>
          ) : null}
          <DialogClose asChild>
            <button
              className="resource-icon-button"
              type="button"
              aria-label="关闭图片预览"
              title="关闭（Esc）"
            >
              <X size={18} />
            </button>
          </DialogClose>
        </div>
      </header>
      {feedback ? (
        <p
          className="resource-feedback"
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}
      <div
        className="resource-preview-stage"
        data-original={original}
        aria-busy={state === 'loading'}
      >
        {state !== 'loaded' ? (
          <p
            className="resource-preview-message"
            role={state === 'error' ? 'alert' : 'status'}
          >
            {state === 'error'
              ? '图片无法显示，请确认文件或网络地址是否可用。'
              : '正在加载图片…'}
          </p>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.name}
          referrerPolicy="no-referrer"
          className="resource-preview-image"
          data-loaded={state === 'loaded'}
          onLoad={(event) => {
            const element = event.currentTarget;
            setDimensions(`${element.naturalWidth} × ${element.naturalHeight}`);
            setState('loaded');
          }}
          onError={() => setState('error')}
        />
      </div>
      <footer className="resource-preview-footer">
        <div className="resource-actions">
          <button
            className="resource-icon-button"
            type="button"
            aria-label="上一张图片"
            title="上一张（←）"
            disabled={index <= 0}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="resource-preview-counter" aria-live="polite">
            {index + 1} / {images.length}
          </span>
          <button
            className="resource-icon-button"
            type="button"
            aria-label="下一张图片"
            title="下一张（→）"
            disabled={index >= images.length - 1}
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          className="resource-button"
          type="button"
          aria-pressed={original}
          disabled={state !== 'loaded'}
          onClick={() => setOriginal((value) => !value)}
        >
          <Maximize size={15} aria-hidden="true" />
          {original ? '适应窗口' : '原始尺寸'}
        </button>
      </footer>
    </DialogContent>
  );
}
