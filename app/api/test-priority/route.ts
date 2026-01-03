import { NextResponse } from 'next/server';
import { createAsanaClient } from '@/lib/integrations/asana';
import { getUserTokens, forceRefreshToken } from '@/lib/auth/tokens';
import { db } from '@/lib/db/client';
import { platformConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Test endpoint to verify priority custom field works
// GET /api/test-priority?userId=xxx&projectGid=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let userId = searchParams.get('userId');
  const projectGid = searchParams.get('projectGid') || '1212608293464251'; // Default to known project
  const workspaceGid = searchParams.get('workspaceGid') || '1212589062056881'; // Default workspace
  
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [] as Array<Record<string, unknown>>,
  };
  
  const steps = results.steps as Array<Record<string, unknown>>;
  
  try {
    // Step 0: Auto-discover userId if not provided
    if (!userId) {
      steps.push({ step: 0, action: 'Auto-discovering userId with Asana tokens' });
      
      const asanaConnections = await db
        .select({ userId: platformConnections.userId })
        .from(platformConnections)
        .where(eq(platformConnections.platform, 'asana'))
        .limit(1);
      
      if (asanaConnections.length > 0) {
        userId = asanaConnections[0].userId;
        steps.push({ 
          step: 0, 
          status: 'success', 
          discoveredUserId: userId,
          message: 'Found userId with Asana tokens'
        });
      } else {
        return NextResponse.json({
          error: 'No Asana tokens found in database',
          hint: 'Connect Asana first via the OAuth flow',
          results
        }, { status: 400 });
      }
    }
    
    // Step 1: Get Asana tokens
    steps.push({ step: 1, action: 'Getting Asana tokens', userId });
    const tokens = await getUserTokens(userId, 'asana');
    if (!tokens) {
      return NextResponse.json({ 
        error: `No Asana tokens found for userId: ${userId}`,
        hint: 'The userId may have been deleted or tokens expired',
        results 
      }, { status: 400 });
    }
    steps.push({ step: 1, status: 'success', hasTokens: true, hasRefreshToken: !!tokens.refreshToken });
    
    // Step 1.5: Proactively refresh token to ensure we have a valid one
    steps.push({ step: '1.5', action: 'Proactively refreshing Asana token' });
    let accessToken = tokens.accessToken;
    
    try {
      console.log('[test-priority] Proactively refreshing token...');
      const refreshResult = await forceRefreshToken(userId, 'asana', tokens);
      accessToken = refreshResult.accessToken;
      steps.push({ 
        step: '1.5', 
        status: 'refreshed',
        message: 'Token refreshed successfully',
        newExpiresAt: refreshResult.expiresAt?.toISOString(),
      });
      console.log('[test-priority] Token refreshed successfully');
    } catch (refreshError) {
      const refreshErr = refreshError as Error;
      console.log('[test-priority] Token refresh failed:', refreshErr.message);
      // Token might still be valid, continue with existing token
      steps.push({ 
        step: '1.5', 
        status: 'kept_existing',
        message: `Refresh failed (${refreshErr.message}), using existing token`,
        warning: 'Existing token may be expired',
      });
    }
    
    // Step 2: Create Asana client with refreshed token and userId for further auto-refresh
    const asanaClient = createAsanaClient(accessToken, userId);
    steps.push({ step: 2, action: 'Created Asana client with refreshed token', status: 'success' });
    
    // Step 2.5: Test raw custom field API call (for debugging) - using refreshed token
    steps.push({ step: '2.5', action: 'Testing raw Asana custom field API (with refreshed token)' });
    try {
      const rawUrl = `https://app.asana.com/api/1.0/projects/${projectGid}/custom_field_settings?opt_fields=custom_field.gid,custom_field.name,custom_field.type,custom_field.enum_options.gid,custom_field.enum_options.name`;
      console.log('[test-priority] Raw API URL:', rawUrl);
      
      const rawResponse = await fetch(rawUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }  // Use refreshed token
      });
      
      const rawText = await rawResponse.text();
      console.log('[test-priority] Raw API response status:', rawResponse.status);
      console.log('[test-priority] Raw API response body:', rawText);
      
      let rawData: { data?: Array<{ custom_field?: { name?: string; gid?: string; type?: string; enum_options?: Array<{ name?: string; gid?: string }> } }> } = { data: [] };
      try {
        rawData = JSON.parse(rawText);
      } catch {
        console.log('[test-priority] Failed to parse raw response as JSON');
      }
      
      steps.push({
        step: '2.5',
        status: rawResponse.ok ? 'success' : 'error',
        httpStatus: rawResponse.status,
        fieldsFound: rawData.data?.length || 0,
        fieldNames: rawData.data?.map((s) => s.custom_field?.name) || [],
        fieldDetails: rawData.data?.map((s) => ({
          name: s.custom_field?.name,
          gid: s.custom_field?.gid,
          type: s.custom_field?.type,
          enumOptions: s.custom_field?.enum_options?.map(o => o.name) || []
        })) || [],
        rawResponse: rawData,
      });
    } catch (rawError) {
      const rawErr = rawError as Error;
      steps.push({
        step: '2.5',
        status: 'error',
        error: rawErr.message,
      });
    }
    
    // Step 3: Discover priority field (using client method)
    steps.push({ step: 3, action: 'Discovering priority custom field via client', projectGid });
    const priorityConfig = await asanaClient.getPriorityFieldConfig(projectGid);
    
    if (!priorityConfig) {
      steps.push({ step: 3, status: 'not_found' });
      return NextResponse.json({
        error: 'No Priority custom field found on project',
        hint: 'Add a "Priority" dropdown field to the project with High/Medium/Low options',
        projectGid,
        results
      }, { status: 400 });
    }
    
    steps.push({ 
      step: 3, 
      status: 'success',
      priorityFieldGid: priorityConfig.fieldGid,
      enumOptions: priorityConfig.enumOptions,
    });
    
    // Step 4: Create test task with HIGH priority
    steps.push({ step: 4, action: 'Creating test task with HIGH priority' });
    
    console.log('[test-priority] Creating task with priority: high');
    console.log('[test-priority] Priority config:', JSON.stringify(priorityConfig, null, 2));
    
    const testTask = await asanaClient.createEnhancedTask({
      name: `[TEST] Priority Test - HIGH - ${new Date().toISOString().slice(11, 19)}`,
      notes: 'Test task to verify priority custom field. DELETE AFTER TESTING.',
      priority: 'high',
      projectGid: projectGid,
      workspaceGid: workspaceGid,
    });
    
    // Check if priority was set in the response
    const priorityField = testTask.custom_fields?.find((cf) => 
      cf.name?.toLowerCase() === 'priority'
    );
    const actualPriority = priorityField?.enum_value?.name || 'NOT SET';
    
    steps.push({ 
      step: 4, 
      status: actualPriority !== 'NOT SET' ? 'success' : 'partial',
      taskGid: testTask.gid,
      taskUrl: testTask.permalink_url,
      expectedPriority: 'High',
      actualPriority: actualPriority,
      priorityMatch: actualPriority.toLowerCase() === 'high',
      customFieldsReturned: testTask.custom_fields?.map((cf) => ({
        name: cf.name,
        value: cf.enum_value?.name || cf.text_value || cf.number_value || null
      })) || [],
    });
    
    const success = actualPriority.toLowerCase() === 'high';
    
    return NextResponse.json({
      success,
      message: success 
        ? '✅ Priority custom field is WORKING! Task created with High priority.'
        : '❌ Priority NOT SET on task. Check the custom field configuration.',
      taskUrl: testTask.permalink_url,
      expectedPriority: 'High',
      actualPriority,
      results
    });
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[test-priority] Error:', err);
    steps.push({ 
      step: 'error', 
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 5)
    });
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}

