'use client';

import { useState, useEffect, useCallback } from 'react'; // Added useCallback
import Link from 'next/link';
import { usePrivy, useWallets } from '@privy-io/react-auth'; // Added useWallets
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Imports for blockchain interaction
import { createWalletClient, custom, publicActions, Hex, WalletClient, PublicClient, parseAbiItem, getContract } from 'viem';
import { hardhat } from 'viem/chains';
import { secureBorrowingABI, secureBorrowingContractAddress } from '@/lib/contract';
import { BorrowRequestStatus } from '@prisma/client'; // Import BorrowRequestStatus

interface Item {
  id: string;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  ownerAddress: string;
  borrowerAddress?: string | null;
  status: string;
  borrowingFee?: string | null;
  depositAmount?: string | null;
  contractItemId?: string | null; // This is the itemId for the blockchain
  itemNonce?: string | null;      // Nonce used to generate contractItemId
  transactionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Define a type for BorrowRequest based on your Prisma schema
interface BorrowRequest {
  id: string;
  itemId: string;
  item: Item; // Include the full item details
  borrowerAddress: string;
  ownerAddress: string;
  status: BorrowRequestStatus;
  ownerSignature?: string | null;
  requestedAt: Date;
  updatedAt: Date;
}

export default function ManageItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([]); // State for borrow requests
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: ''
  });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const { user, authenticated, login } = usePrivy();
  const { wallets } = useWallets(); // Hook for wallet interaction

  const fetchUserItemsAndRequests = useCallback(async () => {
    if (!authenticated || !user?.wallet?.address) {
      setItems([]);
      setBorrowRequests([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setMessage(null);

    const userAddress = user.wallet.address.toLowerCase();

    try {
      // Fetch items owned by the user
      const itemsResponse = await fetch(`/api/items?ownerAddress=${userAddress}`);
      if (!itemsResponse.ok) {
        const errorData = await itemsResponse.json();
        throw new Error(errorData.error || 'Failed to fetch items');
      }
      const ownedItems: Item[] = await itemsResponse.json();
      setItems(ownedItems);

      // Fetch borrow requests for items owned by the user
      // We only care about requests PENDING_OWNER_APPROVAL for this section
      const requestsResponse = await fetch(`/api/borrow-requests?userId=${userAddress}&asOwner=true`);
      if (!requestsResponse.ok) {
        const errorData = await requestsResponse.json();
        throw new Error(errorData.error || 'Failed to fetch borrow requests for owner');
      }
      const ownerRequests: BorrowRequest[] = await requestsResponse.json();
      setBorrowRequests(ownerRequests.filter(req => req.status === BorrowRequestStatus.PENDING_OWNER_APPROVAL));

    } catch (err: any) {
      console.error("Error fetching user data:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, user?.wallet?.address]);

  useEffect(() => {
    fetchUserItemsAndRequests();
  }, [fetchUserItemsAndRequests]);

  async function fetchItems() {
    try {
      setIsLoading(true);
      
      // Si el usuario no está autenticado, no hacemos la petición
      if (!authenticated || !user?.wallet?.address) {
        setItems([]);
        return;
      }
      
      const userAddress = user.wallet.address.toLowerCase();
      const response = await fetch('/api/items');
      
      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }
      
      const allItems = await response.json();
      
      // Filtrar solo los items del usuario (propietario o prestatario)
      const userItems = allItems.filter((item: Item) => 
        item.ownerAddress.toLowerCase() === userAddress || 
        (item.borrowerAddress && item.borrowerAddress.toLowerCase() === userAddress)
      );
      
      setItems(userItems);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleEdit(item: Item) {
    if (!authenticated || !user?.wallet?.address) {
      setMessage({ text: 'Debes iniciar sesión para editar items', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    // Verificar si el usuario es el propietario del item
    if (user.wallet.address.toLowerCase() !== item.ownerAddress.toLowerCase()) {
      setMessage({ text: 'Solo puedes editar items que te pertenecen', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    setEditItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      status: item.status
    });
  }

  async function handleDelete(item: Item) { 
    if (!authenticated || !user?.wallet?.address || !wallets || wallets.length === 0) {
      setMessage({ text: 'Debes iniciar sesión y tener una billetera conectada para eliminar items', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    const activeWallet = wallets[0]; // Use the first wallet in the array

    if (user.wallet.address.toLowerCase() !== item.ownerAddress.toLowerCase()) {
      setMessage({ text: 'Solo puedes eliminar items que te pertenecen', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar este item? Esta acción podría requerir una transacción si el item está en la blockchain y no se puede deshacer.')) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage({ text: 'Procesando eliminación...', type: 'success' });

      if (item.contractItemId) {
        setMessage({ text: 'Delistando item de la blockchain...', type: 'success' });

        // Get the EIP1193Provider from the active wallet
        const provider = await activeWallet.getEthereumProvider();

        const walletClient = createWalletClient({
          account: user.wallet.address as Hex,
          chain: hardhat, 
          transport: custom(provider),
        }).extend(publicActions);

        const itemIdToDelist = item.contractItemId as Hex;

        try {
          const { request } = await walletClient.simulateContract({
            address: secureBorrowingContractAddress,
            abi: secureBorrowingABI,
            functionName: 'delistItem',
            args: [itemIdToDelist],
            account: user.wallet.address as Hex,
          });

          const hash = await walletClient.writeContract(request);
          setMessage({ text: `Transacción de delistado enviada: ${hash}. Esperando confirmación...`, type: 'success' });

          // Wait for the transaction to be confirmed
          const publicClientForReceipt = walletClient.extend(publicActions); 
          const receipt = await publicClientForReceipt.waitForTransactionReceipt({ hash });

          if (receipt.status === 'success') {
            setMessage({ text: 'Item delistado de la blockchain exitosamente. Eliminando de la base de datos local...', type: 'success' });
          } else {
            throw new Error('La transacción de delistado en la blockchain falló.');
          }
        } catch (contractError: any) {
          console.error('Error al delistar el item de la blockchain:', contractError);
          let detailedMessage = 'Error al delistar el item de la blockchain.';
          if (contractError.shortMessage) {
              detailedMessage += ` ${contractError.shortMessage}`;
          } else if (contractError.message) {
              detailedMessage += ` ${contractError.message}`;
          }
          setMessage({ text: detailedMessage, type: 'error' });
          setIsLoading(false);
          setTimeout(() => setMessage(null), 7000);
          return; 
        }
      }

      setMessage(prevMessage => ({
        text: item.contractItemId && prevMessage?.text.startsWith('Item delistado') 
              ? prevMessage.text 
              : 'Eliminando item de la base de datos local...',
        type: 'success'
      }));
      
      const response = await fetch(`/api/items/${item.id}?ownerAddress=${user.wallet.address}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al eliminar el item de la base de datos');
      }

      setMessage({ text: 'Item eliminado correctamente de la base de datos.', type: 'success' });
      fetchUserItemsAndRequests(); // Refresh both items and requests
      setTimeout(() => setMessage(null), 3000);

    } catch (err: any) {
      console.error('Error en handleDelete:', err);
      setMessage({ text: err.message || 'Ocurrió un error desconocido durante la eliminación.', type: 'error' });
      setTimeout(() => setMessage(null), 7000);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;

    if (!authenticated || !user?.wallet?.address) {
      setMessage({ text: 'Debes iniciar sesión para realizar esta acción', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    // Verificar si el usuario es el propietario del item
    if (user.wallet.address.toLowerCase() !== editItem.ownerAddress.toLowerCase()) {
      setMessage({ text: 'No tienes permiso para editar este item', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    try {
      const response = await fetch(`/api/items/${editItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          ownerAddress: user.wallet.address // Enviar la dirección para verificación
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar el item');
      }

      setMessage({ text: 'Item actualizado correctamente', type: 'success' });
      setEditItem(null);
      
      // Refrescar la lista
      fetchUserItemsAndRequests(); // Refresh both items and requests
      
      // Limpiar después de 3 segundos
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
      setTimeout(() => setMessage(null), 5000);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  if (!authenticated) {
    return (
      <div className="container max-w-5xl mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold mb-6">Gestión de Items</h1>
        <div className="p-8 bg-gray-50 rounded-lg">
          <p className="mb-4">Debes iniciar sesión para gestionar tus items</p>
          <Button onClick={login}>Iniciar Sesión</Button>
        </div>
      </div>
    );
  }

  if (isLoading) return <p className="text-center p-8">Cargando datos del usuario...</p>; // Updated loading message
  if (error) return <p className="text-center text-red-500 p-8">Error: {error}</p>;

  // This variable is now defined inside the component body before return
  // const pendingOwnerApprovalRequests = borrowRequests.filter(req => req.status === BorrowRequestStatus.PENDING_OWNER_APPROVAL);

  const handleUpdateRequestStatus = async (requestId: string, newStatus: BorrowRequestStatus, signature?: string) => {
    if (!authenticated || !user?.wallet?.address) {
      setMessage({ text: 'Debes iniciar sesión para realizar esta acción', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setMessage({ text: 'Actualizando solicitud...', type: 'success'});

    try {
      const payload: any = { status: newStatus };
      if (signature) {
        payload.ownerSignature = signature;
      }

      const response = await fetch(`/api/borrow-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add Authorization header with Privy token if your API requires it
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar la solicitud de préstamo');
      }
      
      setMessage({ text: `Solicitud ${newStatus === BorrowRequestStatus.APPROVED_BY_OWNER ? 'aprobada' : newStatus === BorrowRequestStatus.REJECTED_BY_OWNER ? 'rechazada' : 'actualizada'}.`, type: 'success' });
      fetchUserItemsAndRequests(); // Refresh requests and items
      setTimeout(() => setMessage(null), 3000);

    } catch (err: any) {
      console.error('Error updating borrow request:', err);
      setMessage({ text: err.message, type: 'error' });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleApproveRequest = async (request: BorrowRequest) => {
    if (!authenticated || !user?.wallet?.address || !wallets || wallets.length === 0) {
      setMessage({ text: 'Debes iniciar sesión y tener una billetera conectada para aprobar solicitudes.', type: 'error' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    const activeWallet = wallets[0];
    const provider = await activeWallet.getEthereumProvider();
    const walletClient = createWalletClient({
      account: user.wallet.address as Hex,
      chain: hardhat, 
      transport: custom(provider),
    }).extend(publicActions);

    setMessage({ text: 'Preparando para firmar la aprobación...', type: 'success' });

    try {
      // 1. Get current item details from contract (fee, deposit, nonce)
      const contract = getContract({
        address: secureBorrowingContractAddress,
        abi: secureBorrowingABI,
        client: walletClient, // Use the public client for reads if walletClient doesn't have read methods, but viem's extended client should work.
      });

      if (!request.item.contractItemId) {
        setMessage({ text: 'Error: El ID del item en el contrato no está disponible.', type: 'error' });
        setTimeout(() => setMessage(null), 5000);
        return;
      }
      
      // Fetch item details (owner, fee, deposit, minBorrowerReputation, status, nonce)
      const itemDetails = await contract.read.items([request.item.contractItemId as Hex]) as unknown[];
      // itemDetails will be an array [owner, nonce, fee, deposit, metadataHash, isAvailable, minBorrowerReputation]
      
      const contractItemOwner = itemDetails[0] as Hex;
      const contractItemNonce = itemDetails[1] as bigint;
      const contractItemFee = itemDetails[2] as bigint;
      const contractItemDeposit = itemDetails[3] as bigint;
      // const contractItemMetadataHash = itemDetails[4] as Hex;
      // const contractItemIsAvailable = itemDetails[5] as boolean;
      // const contractItemMinBorrowerReputation = itemDetails[6] as bigint;

      // Verify owner matches (optional, but good practice if not already verified)
      if (contractItemOwner.toLowerCase() !== user.wallet.address.toLowerCase()) {
        setMessage({ text: 'Error: El firmante no es el propietario del item según el contrato.', type: 'error' });
        setTimeout(() => setMessage(null), 7000);
        return;
      }

      if (typeof contractItemNonce === 'undefined' || typeof contractItemFee === 'undefined' || typeof contractItemDeposit === 'undefined') {
        console.error("Failed to retrieve all necessary item details from contract:", itemDetails);
        setMessage({ text: 'Error: No se pudieron obtener todos los detalles del item (nonce, fee, deposit) del contrato.', type: 'error' });
        setTimeout(() => setMessage(null), 7000);
        return;
      }

      const typedData = {
        domain: {
          name: 'SecureBorrowing', // Must match contract EIP712 domain name
          version: '1',           // Must match contract EIP712 version
          chainId: hardhat.id,    // Ensure this is the correct chainId
          verifyingContract: secureBorrowingContractAddress as Hex,
        },
        types: {
          BorrowItem: [ // Order and types must match BORROW_TYPEHASH in contract
            { name: 'itemId', type: 'bytes32' },
            { name: 'fee', type: 'uint256' },
            { name: 'deposit', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'borrower', type: 'address' },
          ],
        } as const, // Add 'as const' for stricter typing of keys
        primaryType: 'BorrowItem', // This should now be correctly inferred or accepted
        message: {
          itemId: request.item.contractItemId as Hex,
          fee: contractItemFee, // Use fee from contract
          deposit: contractItemDeposit, // Use deposit from contract
          nonce: contractItemNonce, // Use nonce from contract
          borrower: request.borrowerAddress as Hex,
        },
      };
      
      setMessage({ text: 'Por favor, firma la transacción en tu billetera para aprobar el préstamo.', type: 'success' });
      // 3. Prompt owner to sign using viem's walletClient
      const signature = await walletClient.signTypedData(typedData);
      
      setMessage({ text: 'Firma obtenida. Actualizando solicitud...', type: 'success' });
      // 4. Send the real signature to the API
      await handleUpdateRequestStatus(request.id, BorrowRequestStatus.APPROVED_BY_OWNER, signature as string);

    } catch (err: any) {
      console.error('Error during approval process:', err);
      let detailedMessage = 'Error al aprobar la solicitud.';
      if (err.shortMessage) {
        detailedMessage += ` ${err.shortMessage}`;
      } else if (err.message) {
        detailedMessage += ` ${err.message}`;
      }
      setMessage({ text: detailedMessage, type: 'error' });
      setTimeout(() => setMessage(null), 7000);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    await handleUpdateRequestStatus(requestId, BorrowRequestStatus.REJECTED_BY_OWNER);
  };

  // Filter for pending requests directly before rendering or where needed
  const pendingOwnerApprovalRequests = borrowRequests.filter(req => req.status === BorrowRequestStatus.PENDING_OWNER_APPROVAL);


  return (
    <div className="container max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestión de Items</h1>
        <Button asChild>
          <Link href="/">Volver al Inicio</Link>
        </Button>
      </div>

      {message && (
        <div 
          className={`p-4 mb-6 rounded-md ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {editItem && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Editar Item</CardTitle>
            <CardDescription>
              Actualiza la información del item. Los items vinculados a la blockchain solo pueden ser editados localmente.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input 
                  id="name" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea 
                  id="description" 
                  name="description" 
                  value={formData.description} 
                  onChange={handleChange}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <select 
                  id="status" 
                  name="status" 
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="available">Disponible</option>
                  <option value="borrowed">Prestado</option>
                  <option value="in_dispute">En disputa</option>
                </select>
              </div>

              {editItem.contractItemId && (
                <div className="bg-amber-50 p-4 rounded-md border border-amber-200 text-amber-800">
                  <p className="text-sm">
                    <strong>Nota:</strong> Este item está vinculado a la blockchain (ID: {editItem.contractItemId?.substring(0, 8)}...)
                    Los cambios solo afectarán a la base de datos local.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setEditItem(null)}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar Cambios</Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* Section for Pending Borrow Requests */}
      {pendingOwnerApprovalRequests.length > 0 && (
        <div className="mt-12 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Solicitudes de Préstamo Pendientes ({pendingOwnerApprovalRequests.length})</h2>
          <div className="grid gap-6">
            {pendingOwnerApprovalRequests.map((request) => (
              <Card key={request.id} className="bg-yellow-50 border-l-4 border-yellow-400">
                <CardHeader>
                  <CardTitle>Solicitud para: {request.item.name}</CardTitle>
                  <CardDescription>
                    Solicitante: {request.borrowerAddress.slice(0,6)}...{request.borrowerAddress.slice(-4)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Recibida: {new Date(request.requestedAt).toLocaleString()}</p>
                  <p className="text-sm mt-1">Item ID: <span className="font-mono text-xs">{request.item.id}</span></p>
                  <p className="text-sm mt-1">Item Contract ID: <span className="font-mono text-xs">{request.item.contractItemId || 'N/A'}</span></p>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                  <Button 
                    variant="outline"
                    onClick={() => handleRejectRequest(request.id)}
                    disabled={isLoading} // Disable while any loading is in progress
                  >
                    Rechazar
                  </Button>
                  <Button 
                    onClick={() => handleApproveRequest(request)} 
                    className="bg-green-500 hover:bg-green-600 text-white"
                    disabled={isLoading} // Disable while any loading is in progress
                  >
                    Aprobar y Firmar (Test)
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {/* Adjusted title to reflect these are owned items */}
        <h2 className="text-xl font-semibold mb-2">Mis Items Listados ({items.length})</h2> 
          {(items.length === 0 && pendingOwnerApprovalRequests.length === 0 && authenticated) ? (
          <p className="text-center p-6 bg-gray-50 rounded-md">
            No tienes items para mostrar. 
            <Link href="/list-item" className="ml-2 text-blue-600 hover:underline">
              Agregar un nuevo item
            </Link>
            {" "}o{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              solicitar un préstamo
            </Link>
          </p>
        ) : (          items.map((item) => {
            const isOwner = user?.wallet?.address?.toLowerCase() === item.ownerAddress.toLowerCase();
            const isBorrower = item.borrowerAddress && user?.wallet?.address?.toLowerCase() === item.borrowerAddress.toLowerCase();
            return (
              <Card key={item.id} className={item.contractItemId ? 'border-l-4 border-l-blue-500' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{item.name}</CardTitle>
                      <CardDescription>
                        {item.description?.substring(0, 100) || 'Sin descripción'}
                        {item.description && item.description.length > 100 ? '...' : ''}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {item.contractItemId && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                          Blockchain
                        </span>
                      )}
                      {isOwner && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                          Mi Item
                        </span>
                      )}
                      {isBorrower && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
                          En Préstamo
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>ID:</strong> {item.id}
                    </p>
                    <p>
                      <strong>Propietario:</strong> {item.ownerAddress.slice(0, 6)}...{item.ownerAddress.slice(-4)}
                    </p>
                    {isBorrower && (
                      <p>
                        <strong>Tomado en préstamo:</strong> {new Date(item.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                    <p>
                      <strong>Estado:</strong>{" "}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.status === "available"
                            ? "bg-green-100 text-green-700"
                            : item.status === "borrowed" 
                              ? "bg-purple-100 text-purple-700" 
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {item.status === "available" ? "Disponible" : 
                         item.status === "borrowed" ? "Prestado" : 
                         item.status === "in_dispute" ? "En Disputa" : item.status}
                      </span>
                    </p>
                    {item.contractItemId && (
                      <p>
                        <strong>ID Blockchain:</strong> {item.contractItemId.slice(0, 8)}...{item.contractItemId.slice(-6)}
                      </p>
                    )}
                  </div>
                </CardContent>                <CardFooter className="flex justify-end space-x-2">
                  {isOwner && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(item)}
                      >
                        Editar
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(item)} // Pass the full item object
                      >
                        Eliminar
                      </Button>
                    </>
                  )}
                  {isBorrower && (
                    <div className="text-sm text-gray-600">
                      Este item está prestado a ti. Para devolverlo, contacta con el propietario.
                    </div>
                  )}
                  {!isOwner && !isBorrower && (
                    <p className="text-sm text-gray-500 italic">
                      No tienes acceso a modificar este item
                    </p>
                  )}
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
