import { Names } from '../Names.js';

export class NicknameEditor {
  constructor({ inputEl, displayEl, buttonEl, onSave }) {
    this.inputEl = inputEl;
    this.displayEl = displayEl;
    this.buttonEl = buttonEl;
    this.onSave = onSave;
    this.localNickname = Names.get();
    this.mode = 'read';
    this._bind();
    this._updateUI('read');
  }

  _bind() {
    if (!this.buttonEl) return;

    this.buttonEl.addEventListener('click', () => {
      if (this.mode === 'read') {
        this._updateUI('edit');
        this.inputEl?.focus();
      } else {
        this._saveNickname();
      }
    });

    this.inputEl?.addEventListener('input', () => {
      this._checkSaveButtonState();
    });

    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.buttonEl && !this.buttonEl.disabled) {
          this.buttonEl.click();
        }
      }
    });
  }

  _saveNickname() {
    const value = this.inputEl?.value.trim();
    if (!value || value === this.localNickname) {
      this._updateUI('read');
      return;
    }

    Names.save(value);
    this.localNickname = value;
    this._updateUI('read');
    if (typeof this.onSave === 'function') {
      this.onSave(this.localNickname);
    }
  }

  _updateUI(mode) {
    this.mode = mode;
    if (mode === 'read') {
      if (this.displayEl) {
        this.displayEl.textContent = this.localNickname;
        this.displayEl.style.display = 'inline-block';
      }
      if (this.inputEl) {
        this.inputEl.style.display = 'none';
      }
      if (this.buttonEl) {
        this.buttonEl.textContent = 'EDIT';
        this.buttonEl.disabled = false;
        this.buttonEl.className = 'btn-nick-action';
      }
    } else {
      if (this.displayEl) {
        this.displayEl.style.display = 'none';
      }
      if (this.inputEl) {
        this.inputEl.style.display = 'inline-block';
        this.inputEl.value = this.localNickname;
      }
      if (this.buttonEl) {
        this.buttonEl.textContent = 'SAVE';
      }
      this._checkSaveButtonState();
    }
  }

  _checkSaveButtonState() {
    if (!this.buttonEl || !this.inputEl) return;
    const currentVal = this.inputEl.value.trim();
    const shouldEnable = currentVal !== '' && currentVal !== this.localNickname;
    this.buttonEl.disabled = !shouldEnable;
    this.buttonEl.className = shouldEnable ? 'btn-nick-action save-active' : 'btn-nick-action save-dimmed';
  }

  setDisabled(isDisabled) {
    if (this.inputEl) this.inputEl.disabled = isDisabled;
    if (this.buttonEl) this.buttonEl.disabled = isDisabled;
  }

  getNickname() {
    return this.localNickname;
  }
}
