import { NextResponse } from 'next/server';
import { createAsanaClient } from '@/lib/integrations/asana';
import { getUserTokens } from '@/lib/auth/tokens';

// Test endpoint to verify priority custom field works
// GET /api/test-priority?userId=xxx&projectGid=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'test-user';
  const projectGid = searchParams.get('projectGid') || '1212608293464251'; // Default to known project
  const workspaceGid = searchParams.get('workspaceGid') || '1212589062056881'; // Default workspace
  
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [] as Array<Record<string, unknown>>,
  };
  
  const steps = results.steps as Array<Record<string, unknown>>;
  
  try {
    // Step 1: Get Asana tokens
    steps.push({ step: 1, action: 'Getting Asana tokens' });
    const tokens = await getUserTokens(userId, 'asana');
    if (!tokens) {
      return NextResponse.json({ 
        error: 'No Asana tokens found',
        hint: 'Connect Asana first or provide valid userId',
        results 
      }, { status: 400 });
    }
    steps.push({ step: 1, status: 'success', hasTokens: true });
    
    // Step 2: Create Asana client
    const asanaClient = createAsanaClient(tokens.accessToken);
    steps.push({ step: 2, action: 'Created Asana client' });
    
    // Step 3: Discover priority field
    steps.push({ step: 3, action: 'Discovering priority custom field' });
    const priorityConfig = await asanaClient.getPriorityFieldConfig(projectGid);
    steps.push({ 
      step: 3, 
      status: priorityConfig ? 'success' : 'not_found',
      priorityConfig 
    });
    
    if (!priorityConfig) {
      return NextResponse.json({
        error: 'No Priority custom field found on project',
        hint: 'Add a "Priority" dropdown field to the project with High/Medium/Low options',
        results
      }, { status: 400 });
    }
    
    // Step 4: Create test task with HIGH priority
    steps.push({ step: 4, action: 'Creating test task with HIGH priority' });
    
    const testTask = await asanaClient.createEnhancedTask({
      name: `[TEST] Priority Test - ${new Date().toISOString()}`,
      notes: 'This is a test task to verify priority custom field works. Delete after testing.',
      priority: 'high',
      projectGid: projectGid,
      workspaceGid: workspaceGid,
    });
    
    // Find priority value in custom fields
    const priorityField = testTask.custom_fields?.find((cf) => 
      cf.name?.toLowerCase() === 'priority'
    );
    
    steps.push({ 
      step: 4, 
      status: 'success',
      taskGid: testTask.gid,
      taskUrl: testTask.permalink_url,
      taskPriority: priorityField?.enum_value?.name || 'NOT SET',
    });
    
    return NextResponse.json({
      success: true,
      message: 'Test task created - check Asana to verify Priority is set to High',
      taskUrl: testTask.permalink_url,
      results
    });
    
  } catch (error: unknown) {
    const err = error as Error;
    steps.push({ 
      step: 'error', 
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 5)
    });
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}

