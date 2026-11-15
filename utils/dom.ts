/** セレクタに一致する要素を返す。見つからない場合はエラーにする。 */
export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

/** 要素のテキストを設定する。 */
export function setText(
  selector: string,
  text: string,
  root: ParentNode = document,
): void {
  requiredElement(root, selector).textContent = text;
}

/** 要素の `aria-label` を設定する。 */
export function setLabel(
  selector: string,
  label: string,
  root: ParentNode = document,
): void {
  requiredElement(root, selector).setAttribute('aria-label', label);
}
