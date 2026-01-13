import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-landing-features',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  templateUrl: './landing-features.html',
  styleUrl: './landing-features.scss',
})
export class LandingFeatures {
  features = [
    {
      icon: 'cloud_upload',
      title: 'Upload Anything',
      description: 'Support for PDFs, images, DOCX, and more. Just drag and drop your materials.',
      color: '#60a5fa',
      size: 'normal'
    },
    {
      icon: 'psychology',
      title: 'AI-Powered Generation',
      description: 'Advanced AI analyzes your content and generates relevant, high-quality questions automatically.',
      color: '#8b5cf6',
      size: 'large'
    },
    {
      icon: 'edit_note',
      title: 'Full Customization',
      description: 'Edit, reorder, and fine-tune generated questions. Add your own for the perfect assessment.',
      color: '#f472b6',
      size: 'normal'
    },
    {
      icon: 'insights',
      title: 'Real-time Analytics',
      description: 'Monitor student engagement and performance with live dashboards and detailed reports.',
      color: '#34d399',
      size: 'normal'
    },
    {
      icon: 'groups',
      title: 'Team Collaboration',
      description: 'Share assessments with colleagues, collaborate on question banks, and manage permissions.',
      color: '#fbbf24',
      size: 'normal'
    },
    {
      icon: 'security',
      title: 'Enterprise Security',
      description: 'SOC 2 certified with end-to-end encryption. Your data is always safe and private.',
      color: '#06b6d4',
      size: 'large'
    }
  ];
}
