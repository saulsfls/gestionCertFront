export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question';

export type AlertPosition =
  | 'top-right'   | 'top-left'   | 'top-center'
  | 'bottom-right'| 'bottom-left'| 'bottom-center';

export type AlertKind   = 'toast' | 'dialog';
export type DialogMode  = 'alert' | 'confirm' | 'prompt';

export type AlertSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface AlertSizeOptions {
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  maxHeight?: string;

  scrollable?: boolean;
  messageMaxHeight?: string;

  fontSize?: string;
  titleFontSize?: string;
  lineHeight?: string | number;
}

export interface AlertData {
  id: string;
  kind: AlertKind;
  type: AlertType;
  message: string;
  title?: string;

  position?: AlertPosition;
  duration?: number;
  showProgress?: boolean;
  closeButton?: boolean;
  pauseOnHover?: boolean;

  size?: AlertSize;
  sizeOptions?: AlertSizeOptions;

  dialogMode?: DialogMode;
  dismissible?: boolean;
  confirmText?: string;
  cancelText?: string;
  prompt?: {
    defaultValue?: string;
    placeholder?: string;
    inputType?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url';
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

  size?: AlertSize;
  sizeOptions?: AlertSizeOptions;
  scrollable?: boolean;
}

export const ALERT_SIZE_PRESETS: Record<AlertSize, AlertSizeOptions> = {
  sm:   { width: '280px', fontSize: '13px', titleFontSize: '14px' },
  md:   { width: '380px', fontSize: '14px', titleFontSize: '15px' },
  lg:   { width: '520px', fontSize: '14px', titleFontSize: '16px' },
  xl:   { width: '720px', fontSize: '15px', titleFontSize: '17px' },
  full: { width: '100%', maxWidth: '100%' },
};