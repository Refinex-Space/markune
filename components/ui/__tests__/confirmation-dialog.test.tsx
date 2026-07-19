import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  ConfirmationDialog,
  useConfirmationDialog,
} from '../confirmation-dialog';

function ConfirmationDialogHarness() {
  const [result, setResult] = React.useState<string>('未选择');
  const {
    confirm,
    request,
    resolve,
  } = useConfirmationDialog();

  const openDialog = async () => {
    const confirmed = await confirm({
      confirmLabel: '继续操作',
      description: '这是一项需要明确确认的操作。',
      title: '确认继续？',
      variant: 'destructive',
    });
    setResult(String(confirmed));
  };

  return (
    <>
      <button type="button" onClick={() => void openDialog()}>
        打开确认框
      </button>
      <output>{result}</output>
      <ConfirmationDialog request={request} onResolve={resolve} />
    </>
  );
}

describe('ConfirmationDialog', () => {
  it('通过应用内对话框返回取消和确认结果，不调用 window.confirm', async () => {
    const nativeConfirm = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => {
        throw new Error('不应调用 window.confirm');
      });
    const user = userEvent.setup();

    render(<ConfirmationDialogHarness />);

    await user.click(screen.getByRole('button', { name: '打开确认框' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('确认继续？')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByText('false')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '打开确认框' }));
    await user.click(screen.getByRole('button', { name: '继续操作' }));
    expect(screen.getByText('true')).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();

    nativeConfirm.mockRestore();
  });
});
