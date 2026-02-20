import { NextRequest, NextResponse } from 'next/server';

const PHP_API_URL = 'https://api.globalvision.ch/api/api.php';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    try {
        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_item', id }),
        });

        if (!response.ok) {
            // If PHP script returns 500 or 404
            return NextResponse.json({ error: 'Item not found or API error' }, { status: 404 });
        }

        const item = await response.json();

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        return NextResponse.json(item, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
            }
        });
    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    try {
        const body = await request.json();

        // Filter out ID from body if present
        const { id: _, ...updateData } = body;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ message: 'No fields to update' });
        }

        // Add last_updated
        updateData.last_updated = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_item',
                id,
                data: updateData
            }),
        });

        if (!response.ok) {
            throw new Error(`PHP API error: ${response.statusText}`);
        }

        const result = await response.json();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    try {
        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_item', id }),
        });

        if (!response.ok) {
            throw new Error(`PHP API error: ${response.statusText}`);
        }

        return NextResponse.json({ success: true, message: 'Item deleted' });
    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
