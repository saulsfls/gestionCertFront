export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'question';

export type AlertPosition =
  | 'top-right'    | 'top-left'    | 'top-center'
  | 'bottom-right' | 'bottom-left' | 'bottom-center';

export type AlertKind  = 'toast' | 'dialog';
export type DialogMode = 'alert' | 'confirm' | 'prompt' | 'form';

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

export type AlertFormFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'url'
  | 'textarea'
  | 'select'
  | 'checkbox';

export interface AlertFormFieldOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface AlertFormField {
  name: string;
  label: string;
  type?: AlertFormFieldType;

  placeholder?: string;
  value?: string | number | boolean;
  required?: boolean;
  disabled?: boolean;

  rows?: number;

  options?: AlertFormFieldOption[];

  minLength?: number;
  maxLength?: number;

  min?: number;
  max?: number;

  pattern?: string;
  errorMessage?: string;

  fullWidth?: boolean;
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

  form?: {
    fields: AlertFormField[];
    columns?: 1 | 2;
    submitText?: string;
    validateOnSubmit?: boolean;
  };
}

export type AlertFormValues = Record<string, string | number | boolean>;

export type AlertResult =
  | boolean
  | string
  | null
  | void
  | AlertFormValues;

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
