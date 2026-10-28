export interface ViewResult {
  title: string;
  html: string;
  mount?: (main: HTMLElement) => void | Promise<void>;
}
