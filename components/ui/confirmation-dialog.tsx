'use client';

import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type ConfirmationDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  title: string;
  variant?: 'default' | 'destructive';
};

export type ConfirmationDialogRequest = ConfirmationDialogOptions & {
  id: number;
};

export function useConfirmationDialog() {
  const [request, setRequest] =
    React.useState<ConfirmationDialogRequest | null>(null);
  const requestIdRef = React.useRef(0);
  const pendingResolverRef = React.useRef<((confirmed: boolean) => void) | null>(
    null,
  );

  const confirm = React.useCallback((options: ConfirmationDialogOptions) => {
    pendingResolverRef.current?.(false);
    requestIdRef.current += 1;

    return new Promise<boolean>((resolve) => {
      pendingResolverRef.current = resolve;
      setRequest({ ...options, id: requestIdRef.current });
    });
  }, []);

  const resolve = React.useCallback((confirmed: boolean) => {
    const pendingResolver = pendingResolverRef.current;
    pendingResolverRef.current = null;
    setRequest(null);
    pendingResolver?.(confirmed);
  }, []);

  React.useEffect(
    () => () => {
      const pendingResolver = pendingResolverRef.current;
      pendingResolverRef.current = null;
      pendingResolver?.(false);
    },
    [],
  );

  return { confirm, request, resolve };
}

export function ConfirmationDialog({
  request,
  onResolve,
}: {
  request: ConfirmationDialogRequest | null;
  onResolve: (confirmed: boolean) => void;
}) {
  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onResolve(false);
      }}
    >
      {request ? (
        <AlertDialogContent key={request.id}>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {request.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onResolve(false)}>
              {request.cancelLabel ?? '取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={request.variant}
              onClick={() => onResolve(true)}
            >
              {request.confirmLabel ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
