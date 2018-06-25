import { HotkeyOptions, IHotkeyOptions } from './hotkey.options';
import { Subject } from 'rxjs';
import { Inject, Injectable } from '@angular/core';
import { Hotkey } from './hotkey.model';
import 'mousetrap';

@Injectable()
export class HotkeysService {
  hotkeysPerCombo: { [id: string]: Hotkey[] } = {};

  pausedHotkeys: Hotkey[] = [];
  mousetrap: MousetrapInstance;
  cheatSheetToggle: Subject<any> = new Subject();

  private _preventIn = ['INPUT', 'SELECT', 'TEXTAREA'];

  constructor(@Inject(HotkeyOptions) private options: IHotkeyOptions) {
    Mousetrap.prototype.stopCallback = (
      event: KeyboardEvent,
      element: HTMLElement,
      combo: string,
      callback: Function
    ) => {
      // if the element has the class "mousetrap" then no need to stop
      if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) {
        return false;
      }
      return element.contentEditable && element.contentEditable === 'true';
    };
    this.mousetrap = new (<any>Mousetrap)();
    if (!this.options.disableCheatSheet) {
      this.add(
        new Hotkey(
          this.options.cheatSheetHotkey || '?',
          function(event: KeyboardEvent) {
            this.cheatSheetToggle.next();
          }.bind(this),
          [],
          this.options.cheatSheetDescription || 'Show / hide this help menu'
        )
      );
    }

    if (this.options.cheatSheetCloseEsc) {
      this.add(
        new Hotkey(
          'esc',
          function(event: KeyboardEvent) {
            this.cheatSheetToggle.next(false);
          }.bind(this),
          ['HOTKEYS-CHEATSHEET'],
          this.options.cheatSheetCloseEscDescription || 'Hide this help menu'
        )
      );
    }
  }

  add(hotkey: Hotkey | Hotkey[], specificEvent?: string): Hotkey | Hotkey[] {
    if (Array.isArray(hotkey)) {
      return this.addMultipleHotkeys(hotkey, specificEvent);
    }

    return this.addSingleHotkey(hotkey, specificEvent);
  }

  remove(hotkey?: Hotkey | Hotkey[]): Hotkey | Hotkey[] {
    let temp: Hotkey[] = [];
    if (!hotkey) {
      for (let combo in this.hotkeysPerCombo) {
        this.hotkeysPerCombo[combo].forEach((hotkey: Hotkey) =>
          temp.push(<Hotkey>this.remove(hotkey))
        );
      }
      return temp;
    }
    if (Array.isArray(hotkey)) {
      for (let key of hotkey) {
        this.hotkeysPerCombo[this.getHotkeyGroupId(key)].forEach(
          (hotkey: Hotkey) => temp.push(<Hotkey>this.remove(hotkey))
        );
      }
      return temp;
    }

    let hotkeyId: string = this.getHotkeyGroupId(hotkey);
    let hotkeysGroup: Hotkey[] = this.hotkeysPerCombo[hotkeyId];
    if (!hotkeysGroup) {
      return null;
    }

    delete this.hotkeysPerCombo[hotkeyId];
    this.mousetrap.unbind((<Hotkey>hotkey).combo);
    return hotkey;
  }

  get(combo?: string | string[]): Hotkey | Hotkey[] {
    if (!combo) {
      let temp: Hotkey[] = [];
      for (let combo in this.hotkeysPerCombo) {
        this.hotkeysPerCombo[combo].forEach((hotkey: Hotkey) =>
          temp.push(hotkey)
        );
      }
      return temp;
    }
    if (Array.isArray(combo)) {
      let temp: Hotkey[] = [];
      for (let key of combo) {
        temp.push(<Hotkey>this.get(key));
      }
      return temp;
    }

    return this.hotkeysPerCombo[JSON.stringify(combo)];
  }

  pause(hotkey?: Hotkey | Hotkey[]): Hotkey | Hotkey[] {
    if (!hotkey) {
      let temp: Hotkey[] = [];
      for (let combo in this.hotkeysPerCombo) {
        this.hotkeysPerCombo[combo].forEach((hotkey: Hotkey) =>
          temp.push(<Hotkey>this.remove(hotkey))
        );
      }
      return temp;
    }
    if (Array.isArray(hotkey)) {
      let temp: Hotkey[] = [];
      for (let key of hotkey) {
        temp.push(<Hotkey>this.pause(key));
      }
      return temp;
    }
    this.remove(hotkey);
    this.pausedHotkeys.push(<Hotkey>hotkey);
    return hotkey;
  }

  unpause(hotkey?: Hotkey | Hotkey[]): Hotkey | Hotkey[] {
    if (!hotkey) {
      return this.unpause(this.pausedHotkeys);
    }
    if (Array.isArray(hotkey)) {
      let temp: Hotkey[] = [];
      for (let key of hotkey) {
        temp.push(<Hotkey>this.unpause(key));
      }
      return temp;
    }
    let index: number = this.pausedHotkeys.indexOf(<Hotkey>hotkey);
    if (index > -1) {
      this.add(hotkey);
      return this.pausedHotkeys.splice(index, 1);
    }
    return null;
  }

  reset() {
    this.mousetrap.reset();
  }

  private addMultipleHotkeys(
    hotkey: Hotkey[],
    specificEvent?: string
  ): Hotkey[] {
    let temp: Hotkey[] = [];
    for (let key of hotkey) {
      temp.push(<Hotkey>this.add(key, specificEvent));
    }
    return temp;
  }

  private addSingleHotkey(hotkey: Hotkey, specificEvent?: string) {
    this.createOrAddToHotkeyToGroup(hotkey);
    this.mousetrap.bind(
      hotkey.combo,
      this.hotkeyGroupCallback(
        this.hotkeysPerCombo[this.getHotkeyGroupId(hotkey)]
      ),
      specificEvent
    );

    return hotkey;
  }

  private hotkeyGroupCallback: (hotkeys: Hotkey[]) => any = (
    hotkeys: Hotkey[]
  ): any => {
    return (event: KeyboardEvent, combo: string) => {
      hotkeys.forEach((hotkey: Hotkey) =>
        this.hotkeyCallback(hotkey)(event, combo)
      );
    };
  };

  private hotkeyCallback: (hotkey: Hotkey) => any = (hotkey: Hotkey): any => {
    return (event: KeyboardEvent, combo: string) => {
      let shouldExecute = true;

      // if the callback is executed directly `hotkey.get('w').callback()`
      // there will be no event, so just execute the callback.
      if (event) {
        let target: HTMLElement = <HTMLElement>(
          (event.target || event.srcElement)
        ); // srcElement is IE only
        let nodeName: string = target.nodeName.toUpperCase();

        // check if the input has a mousetrap class, and skip checking preventIn if so
        if ((' ' + target.className + ' ').indexOf(' mousetrap ') > -1) {
          shouldExecute = true;
        } else if (
          this._preventIn.indexOf(nodeName) > -1 &&
          hotkey.allowIn.map(allow => allow.toUpperCase()).indexOf(nodeName) ===
            -1
        ) {
          // don't execute callback if the event was fired from inside an element listed in preventIn but not in allowIn
          shouldExecute = false;
        }
      }

      if (shouldExecute) {
        return hotkey.callback.apply(this, [event, combo]);
      }
    };
  };

  private createOrAddToHotkeyToGroup(hotkey: Hotkey): void {
    let hotkeyGroupId: string = this.getHotkeyGroupId(hotkey);
    let hotkeyGroupPerCombo: Hotkey[] = this.getHotkeyGroup(hotkeyGroupId);

    if (hotkeyGroupPerCombo) {
      this.hotkeysPerCombo[hotkeyGroupId] = hotkeyGroupPerCombo.concat(hotkey);
    } else {
      this.hotkeysPerCombo[hotkeyGroupId] = [hotkey];
    }
  }

  private getHotkeyGroup(hotkeyId: string): Hotkey[] {
    return this.hotkeysPerCombo[hotkeyId];
  }

  private getHotkeyGroupId(hotkey: Hotkey): string {
    return JSON.stringify(hotkey.combo);
  }
}
