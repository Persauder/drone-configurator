let closeActiveMenu: (() => void) | undefined;

function enhanceSelect(select: HTMLSelectElement): void {
  const field = select.closest<HTMLElement>('.field');
  const label = field?.querySelector<HTMLLabelElement>('.field-label');
  const shell = document.createElement('div');
  const trigger = document.createElement('button');
  const value = document.createElement('span');
  const menuId = `${select.id}-options`;
  let menu: HTMLDivElement | undefined;
  let activeOption: HTMLButtonElement | undefined;
  let typeahead = '';
  let typeaheadTimer: number | undefined;

  shell.className = 'custom-select';
  trigger.type = 'button';
  trigger.id = `${select.id}-trigger`;
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', menuId);
  if (label) {
    label.htmlFor = trigger.id;
    trigger.setAttribute('aria-labelledby', label.id);
  } else {
    trigger.setAttribute('aria-label', select.name);
  }

  value.className = 'custom-select-value';
  const chevron = document.createElement('span');
  chevron.className = 'custom-select-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(value, chevron);
  select.before(shell);
  shell.append(select, trigger);
  select.classList.add('native-select');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  function closeMenu(restoreFocus = false): void {
    window.clearTimeout(typeaheadTimer);
    typeahead = '';
    menu?.remove();
    menu = undefined;
    activeOption = undefined;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    shell.classList.remove('is-open');
    if (closeActiveMenu === closeMenu) closeActiveMenu = undefined;
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function positionMenu(): void {
    if (!menu) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    menu.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
    const preferredHeight = Math.min(menu.scrollHeight, 260);
    const openAbove = below < Math.min(preferredHeight, 180) && above > below;
    const space = openAbove ? above : below;
    const height = Math.max(80, Math.min(260, space - 6));
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
    menu.style.maxHeight = `${height}px`;
    menu.style.top = `${openAbove ? rect.top - Math.min(preferredHeight, height) - 6 : rect.bottom + 6}px`;
  }

  function setActive(option: HTMLButtonElement | undefined): void {
    if (!menu || !option) return;
    activeOption?.classList.remove('is-active');
    activeOption = option;
    activeOption.classList.add('is-active');
    trigger.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  }

  function enabledOptions(): HTMLButtonElement[] {
    return menu ? [...menu.querySelectorAll<HTMLButtonElement>('.custom-select-option:not(:disabled)')] : [];
  }

  function renderMenu(): void {
    if (!menu) return;
    menu.replaceChildren();
    [...select.options].forEach((option, index) => {
      if (option.hidden) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.id = `${select.id}-option-${index}`;
      item.className = 'custom-select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(select.selectedIndex === index));
      item.dataset.value = option.value;
      item.disabled = option.disabled;
      item.textContent = option.textContent;
      item.addEventListener('click', () => choose(option.value));
      menu?.append(item);
    });
    positionMenu();
    setActive(enabledOptions().find((item) => item.dataset.value === select.value) ?? enabledOptions()[0]);
  }

  function sync(): void {
    const selected = select.selectedOptions.item(0);
    value.textContent = selected?.textContent ?? '';
    trigger.disabled = select.disabled;
    trigger.classList.toggle('is-placeholder', select.value === '');
    if (select.disabled) closeMenu();
    else if (menu) renderMenu();
  }

  function choose(nextValue: string): void {
    if (select.value !== nextValue) {
      select.value = nextValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    closeMenu(true);
  }

  function openMenu(): void {
    if (trigger.disabled || menu) return;
    closeActiveMenu?.();
    menu = document.createElement('div');
    menu.id = menuId;
    menu.className = 'custom-select-menu';
    menu.setAttribute('role', 'listbox');
    if (label) menu.setAttribute('aria-labelledby', label.id);
    document.body.append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    shell.classList.add('is-open');
    closeActiveMenu = closeMenu;
    renderMenu();
  }

  trigger.addEventListener('click', () => {
    if (menu) closeMenu();
    else openMenu();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu) {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!menu) openMenu();
      else {
        const options = enabledOptions();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const index = options.indexOf(activeOption as HTMLButtonElement);
        setActive(options[(index + direction + options.length) % options.length]);
      }
    } else if (event.key === 'Home' && menu) {
      event.preventDefault();
      setActive(enabledOptions()[0]);
    } else if (event.key === 'End' && menu) {
      event.preventDefault();
      setActive(enabledOptions().at(-1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!menu) openMenu();
      else if (activeOption) choose(activeOption.dataset.value ?? '');
    } else if (event.key === 'Tab' && menu) {
      closeMenu();
    } else if (menu && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      typeahead += event.key.toLocaleLowerCase();
      window.clearTimeout(typeaheadTimer);
      typeaheadTimer = window.setTimeout(() => { typeahead = ''; }, 500);
      const match = enabledOptions().find((item) => item.textContent?.toLocaleLowerCase().startsWith(typeahead));
      if (match) setActive(match);
    }
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (menu && target instanceof Node && !shell.contains(target) && !menu.contains(target)) closeMenu();
  }, true);
  field?.closest('.configuration-panel')?.addEventListener('scroll', () => closeMenu(), { passive: true });
  window.addEventListener('resize', () => closeMenu());
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
  sync();
}

export function enhanceSelects(root: ParentNode): void {
  root.querySelectorAll<HTMLSelectElement>('.configuration-form select').forEach(enhanceSelect);
}
