import os
import glob

def fix(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace("import { getServerSession } from 'next-auth';", "import { getCurrentUser } from '@/lib/auth';")
    content = content.replace("import { authOptions } from '@/lib/auth';", "")
    content = content.replace("const session = await getServerSession(authOptions);", "const user = await getCurrentUser(request);")
    content = content.replace("if (!session?.user)", "if (!user)")
    content = content.replace("session.user.id", "user.id")
    # Also fix Request to NextRequest in route signatures where getCurrentUser is used
    content = content.replace("request: Request", "request: NextRequest")
    content = content.replace("import { NextResponse } from 'next/server';", "import { NextResponse, NextRequest } from 'next/server';")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

for path in glob.glob('src/app/api/bio/**/route.ts', recursive=True):
    fix(path)
