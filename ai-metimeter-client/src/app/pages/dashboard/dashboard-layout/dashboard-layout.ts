import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map, shareReplay } from 'rxjs/operators';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';

import { AgenticModeService } from '../../../services/agentic-mode.service';
import { AgentChat } from '../agent-chat/agent-chat';

@Component({
    selector: 'app-dashboard-layout',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatSidenavModule,
        MatToolbarModule,
        MatListModule,
        MatIconModule,
        MatButtonModule,
        MatSlideToggleModule,
        MatTooltipModule,
        AsyncPipe,
        AgentChat
    ],
    templateUrl: './dashboard-layout.html',
    styleUrl: './dashboard-layout.scss'
})
export class DashboardLayout {
    private breakpointObserver = inject(BreakpointObserver);
    agenticMode = inject(AgenticModeService);

    isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
        .pipe(
            map(result => result.matches),
            shareReplay()
        );

    currentYear = new Date().getFullYear();
}
