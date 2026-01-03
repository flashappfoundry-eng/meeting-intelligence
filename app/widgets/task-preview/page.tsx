'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface TaskItem {
  title?: string;
  task?: string;
  name?: string;
  priority?: 'high' | 'medium' | 'low';
  dueDate?: string;
  assignee?: string;
  context?: string;
}

function TaskPreviewContent() {
  const params = useSearchParams();
  
  // Parse tasks from URL params
  let tasks: TaskItem[] = [];
  try {
    const tasksParam = params.get('tasks');
    if (tasksParam) {
      tasks = JSON.parse(decodeURIComponent(tasksParam));
    }
  } catch {
    // Invalid JSON, show error
  }

  const workspace = params.get('workspace') || 'Default Workspace';
  const project = params.get('project') || 'Default Project';

  // Helper to get task name from various field names
  const getTaskName = (task: TaskItem): string => {
    return task.title || task.task || task.name || 'Untitled Task';
  };

  // Priority badge colors
  const priorityConfig = {
    high: { emoji: '🔴', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    medium: { emoji: '🟡', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
    low: { emoji: '🟢', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  };

  if (tasks.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <p className="text-lg">No tasks to preview</p>
          <p className="text-sm mt-2">Pass tasks via URL parameter</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            ✨ Tasks to Create
          </h1>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {workspace}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {project}
            </span>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-3">
          {tasks.map((task, index) => {
            const priority = task.priority || 'medium';
            const config = priorityConfig[priority];
            const taskName = getTaskName(task);

            return (
              <div 
                key={index}
                className={`rounded-xl border ${config.border} ${config.bg} p-4 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.01]`}
              >
                <div className="flex items-start gap-3">
                  {/* Priority indicator */}
                  <span className="text-xl flex-shrink-0 mt-0.5">
                    {config.emoji}
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    {/* Task name */}
                    <h3 className="font-semibold text-slate-900 text-lg leading-tight">
                      {taskName}
                    </h3>
                    
                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                      {task.dueDate && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {task.dueDate}
                        </span>
                      )}
                      
                      {task.assignee && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {task.assignee}
                        </span>
                      )}
                      
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.text} ${config.bg} border ${config.border}`}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
                      </span>
                    </div>

                    {/* Context */}
                    {task.context && (
                      <p className="mt-2 text-sm text-slate-500 line-clamp-2">
                        {task.context}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer summary */}
        <div className="mt-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-center">
          <p className="text-slate-300">
            <span className="text-2xl mr-2">📋</span>
            <span className="font-semibold text-white">{tasks.length}</span>
            {' '}task{tasks.length !== 1 ? 's' : ''} will be created in{' '}
            <span className="text-cyan-400 font-medium">Asana</span>
          </p>
        </div>

        {/* Asana branding */}
        <div className="mt-4 flex items-center justify-center gap-2 text-slate-500 text-sm">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.5a3 3 0 110 6 3 3 0 010-6zm-6 9a3 3 0 110 6 3 3 0 010-6zm12 0a3 3 0 110 6 3 3 0 010-6z"/>
          </svg>
          <span>Powered by Asana</span>
        </div>
      </div>
    </div>
  );
}

export default function TaskPreviewWidget() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading preview...</div>
      </div>
    }>
      <TaskPreviewContent />
    </Suspense>
  );
}

