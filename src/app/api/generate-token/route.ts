import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Run the Python script to generate the token
    const scriptPath = path.join(process.cwd(), 'scripts', 'create_deriv_token_final.py');

    const token = await new Promise<string>((resolve, reject) => {
      // Pass email and password as command line arguments
      const pythonProcess = spawn('python', [scriptPath, email, password], {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('[Token Generator]', data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('[Token Generator Error]', data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Script exited with code ${code}: ${stderr}`));
          return;
        }

        // Extract token from stdout - look for the token pattern
        const tokenMatch = stdout.match(/TOKEN FOUND: ([a-zA-Z0-9]{12,20})/);
        if (tokenMatch) {
          resolve(tokenMatch[1]);
        } else {
          // Try to read from generated_token.txt
          const fs = require('fs');
          const tokenFilePath = path.join(process.cwd(), 'generated_token.txt');
          if (fs.existsSync(tokenFilePath)) {
            const content = fs.readFileSync(tokenFilePath, 'utf8');
            const fileTokenMatch = content.match(/Token: ([a-zA-Z0-9]{12,20})/);
            if (fileTokenMatch) {
              resolve(fileTokenMatch[1]);
              return;
            }
          }
          reject(new Error('Could not extract token from script output'));
        }
      });

      pythonProcess.on('error', (err) => {
        reject(err);
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Token generation timed out'));
      }, 120000);
    });

    return NextResponse.json({ token, success: true });
  } catch (error: any) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate token', success: false },
      { status: 500 }
    );
  }
}
