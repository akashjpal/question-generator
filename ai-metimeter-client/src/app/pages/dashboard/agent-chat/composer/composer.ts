import { Component, ElementRef, EventEmitter, Output, ViewChild, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-agent-composer',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule],
    templateUrl: './composer.html',
    styleUrl: './composer.scss'
})
export class Composer {
    disabled = input<boolean>(false);
    attachedFileName = input<string | null>(null);

    @Output() send = new EventEmitter<string>();
    @Output() fileSelected = new EventEmitter<File>();

    @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

    text = signal('');

    onSend(): void {
        const value = this.text().trim();
        if (!value || this.disabled()) {
            return;
        }
        this.send.emit(value);
        this.text.set('');
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.onSend();
        }
    }

    triggerFilePicker(): void {
        this.fileInput?.nativeElement.click();
    }

    onFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            this.fileSelected.emit(file);
        }
        input.value = '';
    }
}
