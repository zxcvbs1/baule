import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// API para manejar un item específico por su ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const item = await prisma.item.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
    }

    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    console.error('Error al obtener item:', error);
    return NextResponse.json({ error: 'Error al obtener el item' }, { status: 500 });
  }
}

// Actualizar un item por su ID (PATCH para actualización parcial)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const data = await request.json();
    
    // Validación básica
    if (data.name && typeof data.name !== 'string') {
      return NextResponse.json({ error: 'El nombre debe ser un texto' }, { status: 400 });
    }
    
    // Verificar si el item existe
    const existingItem = await prisma.item.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
    }
    
    // Verificar si el usuario es el propietario
    const { ownerAddress } = data;
    if (ownerAddress && ownerAddress !== existingItem.ownerAddress) {
      return NextResponse.json({ error: 'No tienes permiso para modificar este item' }, { status: 403 });
    }

    // Actualizar el item
    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description: data.description !== undefined ? data.description : undefined,
        status: data.status !== undefined ? data.status : undefined,
        // Más campos podrían ser añadidos aquí según sea necesario
      },
    });

    return NextResponse.json(updatedItem, { status: 200 });
  } catch (error) {
    console.error('Error al actualizar item:', error);
    return NextResponse.json({ error: 'Error al actualizar el item' }, { status: 500 });
  }
}

// Eliminar un item por su ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    // Verificar si el item existe
    const existingItem = await prisma.item.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
    }
    
    // Verificar si el usuario es el propietario
    // Extraer ownerAddress de la solicitud
    const url = new URL(request.url);
    const ownerAddress = url.searchParams.get('ownerAddress');
    
    if (!ownerAddress || ownerAddress !== existingItem.ownerAddress) {
      return NextResponse.json({ error: 'No tienes permiso para eliminar este item' }, { status: 403 });
    }

    // Eliminar el item
    await prisma.item.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Item eliminado correctamente' }, { status: 200 });
  } catch (error) {
    console.error('Error al eliminar item:', error);
    return NextResponse.json({ error: 'Error al eliminar el item' }, { status: 500 });
  }
}
