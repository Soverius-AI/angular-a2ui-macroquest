import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MacroQuestShell } from './macroquest/ui/macroquest-shell';

@Component({
  selector: 'app-root',
  imports: [MacroQuestShell],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
