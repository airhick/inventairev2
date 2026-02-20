import { NextRequest, NextResponse } from 'next/server';

const PHP_API_URL = 'https://api.globalvision.ch/api/api.php';

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_items' }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`PHP API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const items = await response.json();
        return NextResponse.json(items, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
            }
        });
    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            item_id,
            hex_id,
            tracking_number,
            item_designation,
            description,
            files,
            custom_fields,
            location_id,
            // Add fields that comes from import but were ignored
            name,
            brand,
            model,
            category,
            quantity,
            serialNumber,
            scannedCode
        } = body;

        const data = {
            item_id,
            hex_id,
            // Map frontend fields to DB columns
            name: item_designation || name || 'Untitled Item',
            scanned_code: tracking_number || scannedCode || '',
            serial_number: serialNumber || '',
            details: description || '',
            image: files ? JSON.stringify(files) : '',
            custom_data: custom_fields ? JSON.stringify(custom_fields) : null,
            // Standard fields
            brand: brand || '',
            model: model || '',
            category: category || '',
            quantity: quantity ? parseInt(quantity) : 0,

            // Timestamps
            status: 'available',
            created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            last_updated: new Date().toISOString().slice(0, 19).replace('T', ' ')
        };

        const response = await fetch(PHP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_item',
                data: data
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`PHP API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
