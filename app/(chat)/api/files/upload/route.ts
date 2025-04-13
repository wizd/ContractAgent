import { put } from '@vercel/blob';
import type { PutBlobResult } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';

// 定义允许的文件类型
const ALLOWED_EXTENSIONS = {
  // 图片类型
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  // 文档类型
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain',
};

// 判断文件是否为文档类型
const isDocument = (fileType: string): boolean => {
  const documentTypes = Object.values(ALLOWED_EXTENSIONS).filter(
    (type) => type !== 'image/jpeg' && type !== 'image/png',
  );
  return documentTypes.includes(fileType);
};

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: 'File size should be less than 5MB',
    })
    .refine((file) => Object.values(ALLOWED_EXTENSIONS).includes(file.type), {
      message: `File type not allowed. Allowed types: ${Object.keys(ALLOWED_EXTENSIONS).join(', ')}`,
    }),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);

    // 处理文档转换或直接上传
    let uploadResult: PutBlobResult;

    if (isDocument(file.type)) {
      // 检查是否为文档类型
      try {
        // 使用Web服务处理文档转换为markdown
        const convertFormData = new FormData();
        convertFormData.append(
          'file',
          new Blob([uint8Array], { type: file.type }),
          filename,
        );

        const response = await fetch('http://172.30.245.58:8490/process_file', {
          method: 'POST',
          body: convertFormData,
        });

        if (!response.ok) {
          throw new Error(`服务器返回错误: ${response.status}`);
        }

        // 获取响应内容
        const responseData = await response.text();

        // 解析JSON响应并提取markdown内容
        let markdownText: string;
        try {
          interface MarkdownResponse {
            markdown: string;
          }
          const jsonData = JSON.parse(responseData) as MarkdownResponse;
          if (jsonData.markdown) {
            markdownText = jsonData.markdown;
          } else {
            throw new Error('无法从响应中找到markdown内容');
          }
        } catch (jsonError) {
          console.error('Error parsing JSON response:', jsonError);
          // 如果不是JSON格式，则使用原始响应内容
          markdownText = responseData;
        }

        // 保存markdown文本而不是原始文件
        const markdownFilename = `${filename.split('.')[0]}.md`;
        uploadResult = await put(markdownFilename, markdownText, {
          access: 'public',
          contentType: 'text',
        });
      } catch (convertError) {
        console.error('Error converting document to markdown:', convertError);
        return NextResponse.json(
          { error: 'Failed to convert document to markdown' },
          { status: 500 },
        );
      }
    } else {
      // 如果不是文档类型（如图片），则直接保存原始文件
      uploadResult = await put(`${filename}`, fileBuffer, {
        access: 'public',
      });
    }

    return NextResponse.json(uploadResult);
  } catch (error) {
    console.error('Failed to process request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
