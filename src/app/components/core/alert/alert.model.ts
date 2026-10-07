export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question';

export type AlertPosition =
  | 'top-right'   | 'top-left'   | 'top-center'
  | 'bottom-right'| 'bottom-left'| 'bottom-center';

export type AlertKind   = 'toast' | 'dialog';
export type DialogMode  = 'alert' | 'confirm' | 'prompt';

export interface AlertData {
  id: string;
  kind: AlertKind;
  type: AlertType;
  message: string;
  title?: string;

  /* toast */
  position?: AlertPosition;
  duration?: number;
  showProgress?: boolean;
  closeButton?: boolean;
  pauseOnHover?: boolean;

  /* dialog */
  dialogMode?: DialogMode;
  dismissible?: boolean;
  confirmText?: string;
  cancelText?: string;
  prompt?: {
    defaultValue?: string;
    placeholder?: string;
  };
}

export type AlertResult = boolean | string | null | void;

export interface AlertServiceConfig {
  position: AlertPosition;
  duration: number;
  maxVisible: number;
  pauseOnHover: boolean;
  showProgress: boolean;
  closeButton: boolean;
  dismissible: boolean;
}
