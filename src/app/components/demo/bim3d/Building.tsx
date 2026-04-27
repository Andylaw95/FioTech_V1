import { useMemo } from 'react';
import { MOCK_ROOMS, FLOOR_SIZE, Room } from './mockData';
import * as THREE from 'three';

function RoomBox({ room, selected, onClick }: { room: Room; selected: boolean; onClick: (id: string) => void }) {
  const wallHeight = 0.02;
  const slabHeight = 0.08;
  return (
    <group onClick={(e) => { e.stopPropagation(); onClick(room.id); }}>
      {/* Floor slab */}
      <mesh position={[room.x, slabHeight / 2, room.z]} castShadow receiveShadow>
        <boxGeometry args={[room.w, slabHeight, room.d]} />
        <meshStandardMaterial
          color={selected ? '#fbbf24' : (room.color ?? '#cbd5e1')}
          emissive={selected ? '#f59e0b' : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Outline/top frame (thin) */}
      <mesh position={[room.x, slabHeight + wallHeight / 2 + 0.005, room.z]}>
        <boxGeometry args={[room.w, wallHeight, room.d]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

export function Building({
  selectedRoomId,
  onRoomClick,
  wallsVisible = true,
}: {
  selectedRoomId: string | null;
  onRoomClick: (id: string) => void;
  wallsVisible?: boolean;
}) {
  const ceilingLines = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const h = FLOOR_SIZE.height;
    const hw = FLOOR_SIZE.width / 2;
    const hd = FLOOR_SIZE.depth / 2;
    pts.push(
      new THREE.Vector3(-hw, h, -hd), new THREE.Vector3(hw, h, -hd),
      new THREE.Vector3(hw, h, -hd), new THREE.Vector3(hw, h, hd),
      new THREE.Vector3(hw, h, hd), new THREE.Vector3(-hw, h, hd),
      new THREE.Vector3(-hw, h, hd), new THREE.Vector3(-hw, h, -hd),
      // verticals
      new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(-hw, h, -hd),
      new THREE.Vector3(hw, 0, -hd), new THREE.Vector3(hw, h, -hd),
      new THREE.Vector3(hw, 0, hd), new THREE.Vector3(hw, h, hd),
      new THREE.Vector3(-hw, 0, hd), new THREE.Vector3(-hw, h, hd),
    );
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    return geom;
  }, []);

  return (
    <group>
      {/* Base slab */}
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_SIZE.width + 4, 0.04, FLOOR_SIZE.depth + 4]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Rooms */}
      {MOCK_ROOMS.map(r => (
        <RoomBox key={r.id} room={r} selected={selectedRoomId === r.id} onClick={onRoomClick} />
      ))}

      {/* Ceiling wireframe (glass building look) */}
      {wallsVisible && (
        <lineSegments>
          <primitive object={ceilingLines} attach="geometry" />
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.4} />
        </lineSegments>
      )}

      {/* Floor label on edge */}
      <mesh position={[0, 0.15, -FLOOR_SIZE.depth / 2 - 1.5]}>
        <planeGeometry args={[6, 0.8]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}
