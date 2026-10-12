package golem.spike;
// Golem spike E6: extracts per-state outline and collision shapes, hardness, requiresCorrectToolForDrops
// and the item -> block mapping from the pinned vanilla server.jar, by reflection through Mojang's
// published server mappings (server_mappings.txt). Run by scripts/extract-shapes.sh.
// Usage: java -cp <server jar + libraries + this dir> ShapeExtractor <server_mappings.txt> <out.json>
import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;

public class ShapeExtractor {
  static final Map<String, String> CLS = new HashMap<>();                 // named class -> obfuscated
  static final Map<String, Map<String, String>> MEM = new HashMap<>();   // named class -> "name(params)" or field name -> obfuscated

  static void parse(Path p) throws IOException {
    String cur = null;
    for (String line : Files.readAllLines(p)) {
      if (line.startsWith("#") || line.isBlank()) continue;
      if (!line.startsWith(" ")) {
        String[] a = line.split(" -> ");
        cur = a[0];
        CLS.put(cur, a[1].substring(0, a[1].length() - 1));
        continue;
      }
      String t = line.trim();
      if (t.startsWith("#")) continue;
      String[] a = t.split(" -> ");
      String left = a[0].replaceFirst("^\\d+:\\d+:", "");
      String sig = left.substring(left.indexOf(' ') + 1).replaceFirst("\\):\\d+:\\d+$", ")");
      MEM.computeIfAbsent(cur, k -> new HashMap<>()).putIfAbsent(sig, a[1]);
    }
  }

  static Class<?> cls(String named) throws Exception {
    switch (named) {
      case "int": return int.class; case "float": return float.class; case "double": return double.class;
      case "boolean": return boolean.class; case "long": return long.class; case "void": return void.class;
    }
    return Class.forName(CLS.getOrDefault(named, named));
  }

  static Method method(String owner, String name, String... params) throws Exception {
    String sig = name + "(" + String.join(",", params) + ")";
    String obf = MEM.getOrDefault(owner, Map.of()).getOrDefault(sig, name);
    Class<?>[] types = new Class<?>[params.length];
    for (int i = 0; i < params.length; i++) types[i] = cls(params[i]);
    Method m = cls(owner).getDeclaredMethod(obf, types);
    m.setAccessible(true);
    return m;
  }

  static Object field(String owner, String name, Object target) throws Exception {
    String obf = MEM.getOrDefault(owner, Map.of()).getOrDefault(name, name);
    Field f = cls(owner).getDeclaredField(obf);
    f.setAccessible(true);
    return f.get(target);
  }

  static final List<String> SHAPES = new ArrayList<>();
  static final Map<String, Integer> SHAPE_IDS = new HashMap<>();

  static int shapeId(Object voxelShape, Method toAabbs) throws Exception {
    StringBuilder sb = new StringBuilder("[");
    List<?> boxes = (List<?>) toAabbs.invoke(voxelShape);
    for (int i = 0; i < boxes.size(); i++) {
      Object b = boxes.get(i);
      if (i > 0) sb.append(',');
      sb.append('[');
      String[] f = {"minX", "minY", "minZ", "maxX", "maxY", "maxZ"};
      for (int j = 0; j < 6; j++) {
        if (j > 0) sb.append(',');
        double v = (double) field("net.minecraft.world.phys.AABB", f[j], b);
        sb.append(Math.round(v * 1e6) / 1e6);
      }
      sb.append(']');
    }
    String s = sb.append(']').toString();
    Integer id = SHAPE_IDS.get(s);
    if (id == null) { id = SHAPES.size(); SHAPES.add(s); SHAPE_IDS.put(s, id); }
    return id;
  }

  public static void main(String[] args) throws Exception {
    parse(Path.of(args[0]));
    method("net.minecraft.SharedConstants", "tryDetectVersion").invoke(null);
    method("net.minecraft.server.Bootstrap", "bootStrap").invoke(null);

    final String BS = "net.minecraft.world.level.block.state.BlockState";
    final String BSB = "net.minecraft.world.level.block.state.BlockBehaviour$BlockStateBase";
    final String BG = "net.minecraft.world.level.BlockGetter";
    final String POS = "net.minecraft.core.BlockPos";
    Object blockRegistry = field("net.minecraft.core.registries.BuiltInRegistries", "BLOCK", null);
    Object itemRegistry = field("net.minecraft.core.registries.BuiltInRegistries", "ITEM", null);
    Method getKey = method("net.minecraft.core.Registry", "getKey", "java.lang.Object");
    Method getStateDefinition = method("net.minecraft.world.level.block.Block", "getStateDefinition");
    Method getPossibleStates = method("net.minecraft.world.level.block.state.StateDefinition", "getPossibleStates");
    Method getId = method("net.minecraft.world.level.block.Block", "getId", BS);
    Method getShape = method(BSB, "getShape", BG, POS);
    Method getCollisionShape = method(BSB, "getCollisionShape", BG, POS);
    Method getDestroySpeed = method(BSB, "getDestroySpeed", BG, POS);
    Method requiresTool = method(BSB, "requiresCorrectToolForDrops");
    Method toAabbs = method("net.minecraft.world.phys.shapes.VoxelShape", "toAabbs");
    Object empty = field("net.minecraft.world.level.EmptyBlockGetter", "INSTANCE", null);
    Object zero = field(POS, "ZERO", null);

    StringBuilder out = new StringBuilder("{\"blocks\":{");
    boolean firstBlock = true;
    int states = 0;
    for (Object block : (Iterable<?>) blockRegistry) {
      String key = getKey.invoke(blockRegistry, block).toString();
      List<?> ss = (List<?>) getPossibleStates.invoke(getStateDefinition.invoke(block));
      if (!firstBlock) out.append(',');
      firstBlock = false;
      Object s0 = ss.get(0);
      out.append('"').append(key).append("\":{\"hardness\":").append(getDestroySpeed.invoke(s0, empty, zero))
         .append(",\"requires_correct_tool\":").append(requiresTool.invoke(s0)).append(",\"states\":{");
      for (int i = 0; i < ss.size(); i++) {
        Object st = ss.get(i);
        if (i > 0) out.append(',');
        out.append('"').append(getId.invoke(null, st)).append("\":[")
           .append(shapeId(getShape.invoke(st, empty, zero), toAabbs)).append(',')
           .append(shapeId(getCollisionShape.invoke(st, empty, zero), toAabbs)).append(']');
        states++;
      }
      out.append("}}");
    }
    out.append("},\"items\":{");
    Class<?> blockItem = cls("net.minecraft.world.item.BlockItem");
    Class<?> wallItem = cls("net.minecraft.world.item.StandingAndWallBlockItem");
    Method getBlock = method("net.minecraft.world.item.BlockItem", "getBlock");
    boolean firstItem = true;
    int blockItems = 0;
    for (Object item : (Iterable<?>) itemRegistry) {
      if (!blockItem.isInstance(item)) continue;
      String key = getKey.invoke(itemRegistry, item).toString();
      if (!firstItem) out.append(',');
      firstItem = false;
      blockItems++;
      out.append('"').append(key).append("\":{\"block\":\"").append(getKey.invoke(blockRegistry, getBlock.invoke(item))).append('"');
      if (wallItem.isInstance(item)) out.append(",\"wall_block\":\"").append(getKey.invoke(blockRegistry, field("net.minecraft.world.item.StandingAndWallBlockItem", "wallBlock", item))).append('"');
      out.append('}');
    }
    out.append("},\"shapes\":[").append(String.join(",", SHAPES)).append("],\"shape_index\":[\"outline\",\"collision\"]}\n");
    Files.writeString(Path.of(args[1]), out.toString());
    System.out.println("states " + states + ", distinct shapes " + SHAPES.size() + ", block items " + blockItems);
  }
}
