"""Attach build_hair.py's hair (the applied curves object 'hair') to an
imported character: appended from the .blend and parented to the armature's
head bone, placed while the armature is at rest — the hair was built around
the rest-pose head — so it follows the head in every animation."""
import bpy


def attach_hair(path, scene):
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = ['hair']
    hair = dst.objects[0]
    scene.collection.objects.link(hair)
    arm = next(o for o in scene.objects if o.type == 'ARMATURE' and 'head' in o.data.bones)
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    world = hair.matrix_world.copy()
    hair.parent = arm
    hair.parent_type = 'BONE'
    hair.parent_bone = 'head'
    bpy.context.view_layer.update()
    hair.matrix_world = world
    arm.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return hair
