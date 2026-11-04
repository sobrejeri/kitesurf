import type { NextRequest } from 'next/server';
import { chatDockRequest } from '@/lib/chat-dock-server';
export const dynamic = 'force-dynamic';
export const GET = (request: NextRequest) => chatDockRequest(request,'instrutor');
export const POST = GET;
