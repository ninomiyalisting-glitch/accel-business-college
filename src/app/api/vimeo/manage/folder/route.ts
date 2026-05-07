import { NextRequest, NextResponse } from 'next/server'

const ROOT_PROJECT_ID = '25313251'

// GET: list ビジカレ勉強会 (root) + its subfolders only
export async function GET() {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.vimeo.*+json;version=3.4',
  }

  // Fetch root folder info
  const rootRes = await fetch(
    `https://api.vimeo.com/me/projects/${ROOT_PROJECT_ID}?fields=uri,name,description,created_time`,
    { headers, cache: 'no-store' }
  )
  const rootText = await rootRes.text()
  const rootFolder = rootRes.ok ? JSON.parse(rootText) : { uri: `/users/me/projects/${ROOT_PROJECT_ID}`, name: 'ビジカレ勉強会', description: null, created_time: '' }

  // Fetch subfolders inside root
  const subRes = await fetch(
    `https://api.vimeo.com/me/projects/${ROOT_PROJECT_ID}/items?per_page=100&fields=type,folder`,
    { headers, cache: 'no-store' }
  )
  const subText = await subRes.text()
  let subfolders: { uri: string; name: string; description: string | null; created_time: string }[] = []
  if (subRes.ok && subText.trim()) {
    const parsed = JSON.parse(subText)
    subfolders = (parsed.data ?? [])
      .filter((item: { type: string; folder?: { uri: string; name: string; description: string | null; created_time: string } }) => item.type === 'folder' && item.folder)
      .map((item: { type: string; folder?: { uri: string; name: string; description: string | null; created_time: string } }) => item.folder!)
  }

  return NextResponse.json({ data: [rootFolder, ...subfolders] })
}

// POST: create subfolder inside root project
export async function POST(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { name, description } = await req.json()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Create a new project (will be nested inside ROOT_PROJECT_ID)
  const createRes = await fetch('https://api.vimeo.com/me/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.vimeo.*+json;version=3.4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description: description ?? '' }),
  })

  const createText = await createRes.text()
  if (!createRes.ok) {
    console.error('[folder/create] error:', createRes.status, createText)
    return NextResponse.json({ error: `Vimeo: ${createRes.status}` }, { status: createRes.status })
  }

  const created = JSON.parse(createText)
  const newProjectId = (created.uri as string).split('/').pop()

  // Try to nest it inside root project (best-effort)
  await fetch(`https://api.vimeo.com/me/projects/${ROOT_PROJECT_ID}/items`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.vimeo.*+json;version=3.4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'folder', id: newProjectId }),
  }).catch(() => {})

  return NextResponse.json({
    id: newProjectId,
    name: created.name,
    uri: created.uri,
  })
}
